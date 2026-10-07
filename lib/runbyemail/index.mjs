// Running wOS by email (ROADMAP 2.7), as a small library the suite core can call.
//
//   const rbe = new RunByEmail({ mailbox, publicUrl });
//   rbe.registerApp('crm', { describe: 'Contacts and deals', tools: [...], call: (name, input, ctx) => ... });
//   rbe.onAlertAnswer('board', async (alert, answer) => ...);
//   await rbe.poll();                 // read the team's command mailbox and act (run every 30 seconds)
//   await rbe.sendAlert({ to, title, question, options, app, ref });
//   await rbe.maybeSendDigest();      // the daily digest, once a day after digest_hour
//
// One inbound command address per team: a mailbox the team owns, polled by IMAP.
//   ops@team.example             any text goes to the default agent (here: the email app)
//   crm@... or ops+crm@...       routed to the CRM's tools only (also "crm: ..." in the subject)
//   a reply to an alert          answers it; the reply address carries a signed one-time token
// Only team members' mail that passes SPF, DKIM and DMARC is acted on. Mail from anyone else is logged and
// never answered (answering strangers would make us a spam relay). Anything destructive (delete, email
// outside the team) is never done from a bare reply: the answer is a signed link to click.
import { EventEmitter } from 'node:events';
import { parseRaw, newPart } from '../mail/parse.mjs';
import { domainOf } from '../mail/compose.mjs';
import { id } from '../crypto.mjs';
import { verifySender } from './verify.mjs';
import { issue, consume, check, findReplyTokens } from './tokens.mjs';
import { chat, modelConfigured, untrusted } from '../model.mjs';

const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };

export class RunByEmail extends EventEmitter {
  constructor({ mailbox, publicUrl = process.env.PUBLIC_URL || 'http://localhost:3990', resolver, defaultApp = 'email' }) {
    super();
    Object.assign(this, { mailbox, publicUrl: publicUrl.replace(/\/$/, ''), resolver, defaultApp });
    this.apps = new Map();
    this.answerHandlers = new Map();
  }

  get db() { return this.mailbox.db; }
  get team() { return this.mailbox.team; }

  // ---------- apps the core plugs in ----------

  registerApp(appId, { describe = '', tools = [], call, interpret }) {
    this.apps.set(appId, { id: appId, describe, tools, call, interpret });
  }
  unregisterApp(appId) { this.apps.delete(appId); }
  onAlertAnswer(appId, fn) { this.answerHandlers.set(appId, fn); }

  // ---------- the command mailbox ----------

  async commandAccount() {
    const s = await this.mailbox.settings();
    if (!s.command_account) return null;
    return this.mailbox.account(s.command_account).catch(() => null);
  }

  async #send(msg) {
    const acct = await this.commandAccount();
    if (!acct) throw new Error('Connect a command mailbox first (Settings, Run by email)');
    return this.mailbox.transport(acct).send({ from: { name: `${this.mailbox.name} (wOS)`, address: acct.address }, headers: { 'Auto-Submitted': 'auto-replied', 'X-Wos': 'run-by-email' }, ...msg });
  }

  async poll() {
    const s = await this.mailbox.settings();
    if (!s.run_by_email) return { handled: 0, off: true };
    const acct = await this.commandAccount();
    if (!acct) return { handled: 0, error: 'No command mailbox' };
    const { messages, state } = await this.mailbox.transport(acct).fetchNew(J(acct.sync_state, {}));
    const results = [];
    for (const m of messages) {
      let r;
      try { r = await this.handleInbound(m.raw); } catch (e) { r = { accepted: 0, reason: e.message }; }
      results.push(r);
      // Handled mail leaves the command inbox, so a restart never acts on it twice.
      if (r.message_id) await this.mailbox.transport(acct).archive({ uid: m.uid, messageId: r.message_id }).catch(() => {});
    }
    await this.db.run('UPDATE mail_accounts SET sync_state = ?, last_sync_at = ? WHERE id = ?', [JSON.stringify(state), Date.now(), acct.id]);
    return { handled: results.length, results };
  }

  async handleInbound(raw) {
    const p = await parseRaw(raw);
    const seen = await this.db.get('SELECT * FROM inbound_commands WHERE team_id = ? AND message_id = ?', [this.team, p.messageId]);
    if (seen) return { ...seen, duplicate: true };
    const s = await this.mailbox.settings();
    const acct = await this.commandAccount();
    const row = { id: id('cmd_', 10), team_id: this.team, message_id: p.messageId, from_addr: p.from.address, subject: p.subject.slice(0, 300), verified: '{}', accepted: 0, reason: null, app: null, token_id: null, parsed_intent: null, result: null, at: Date.now() };
    const save = async (patch) => {
      Object.assign(row, patch);
      await this.db.run('INSERT INTO inbound_commands (id, team_id, message_id, from_addr, subject, verified, accepted, reason, app, token_id, parsed_intent, result, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', Object.values(row));
      this.emit('command', row);
      return row;
    };

    // Loops: never act on our own mail or on automatic replies (out-of-office, bounces).
    if ((acct && p.from.address === acct.address) || (p.autoSubmitted && p.autoSubmitted !== 'no') || /^(mailer-daemon|postmaster)@/i.test(p.from.address)) {
      return save({ reason: 'Ignored: sent automatically' });
    }
    const member = await this.mailbox.memberByEmail(p.from.address);
    const v = await verifySender(raw, { trustedAuthserv: s.trusted_authserv, policy: s.auth_policy, resolver: this.resolver });
    row.verified = JSON.stringify({ spf: v.spf, dkim: v.dkim, dmarc: v.dmarc, via: v.via });
    if (!member) return save({ reason: 'Ignored: not a team member' });
    if (!v.ok) return save({ reason: v.reason });

    const actor = { kind: 'person', channel: 'email', name: member.name, id: member.id, email: member.email, role: member.role };
    const body = newPart(p.text);

    // A reply to an alert or an approval request.
    const tokens = [...new Set([...p.to, ...p.cc].flatMap((a) => findReplyTokens(a.address)).concat(findReplyTokens(p.inReplyTo), findReplyTokens(p.references.join(' '))))];
    if (tokens.length) {
      const tok = await consume(this.db, this.team, tokens[0], { kind: 'reply', member: member.email });
      if (tok.error) {
        await this.#reply(p, `That reply could not be used: ${tok.error.toLowerCase()}. Nothing was done.`);
        return save({ accepted: 0, reason: `Reply token: ${tok.error}` });
      }
      const out = await this.#answerAlert(tok.subject_id, body, actor);
      await this.#reply(p, out.text);
      return save({ accepted: 1, token_id: tok.id, app: 'alerts', parsed_intent: JSON.stringify({ answer: out.answer }), result: out.text.slice(0, 2000) });
    }

    // A new command: which app, then what to do.
    const appId = this.#route(p, acct);
    const app = this.apps.get(appId);
    if (!app) {
      const text = `There is no app called "${appId}" switched on. Apps you can write to: ${[...this.apps.keys()].join(', ')}.`;
      await this.#reply(p, text);
      return save({ accepted: 1, app: appId, result: text });
    }
    const command = stripPrefix(body || p.subject, appId) || stripPrefix(p.subject, appId);
    const forwarded = p.text.length > body.length + 20 ? p.text.slice(body.length) : '';
    const intent = await this.#interpret(app, command, { subject: stripPrefix(p.subject, appId), forwarded, from: p.from });
    let text;
    if (intent.reply) text = intent.reply;
    else {
      const res = await app.call(intent.tool, intent.input ?? {}, { actor, via: 'email' });
      text = await this.#describe(res, intent, member);
    }
    await this.#reply(p, text);
    return save({ accepted: 1, app: appId, parsed_intent: JSON.stringify(intent).slice(0, 2000), result: text.slice(0, 2000) });
  }

  #route(p, acct) {
    const [cmdLocal, cmdDomain] = (acct?.address ?? '').split('@');
    for (const a of [...p.to, ...p.cc]) {
      const [local, domain] = a.address.split('@');
      const [base, plus] = local.split('+');
      if (domain === cmdDomain && base === cmdLocal && plus && this.apps.has(plus)) return plus;
      if (domain === cmdDomain && this.apps.has(base)) return base;
    }
    const m = /^\s*([a-z]+)\s*:/i.exec(p.subject);
    if (m && !/^(re|fw|fwd|aw)$/i.test(m[1])) return m[1].toLowerCase();
    return this.defaultApp;
  }

  async #interpret(app, text, extra) {
    const t = String(text ?? '').trim();
    if (!t || /^(help|\?)$/i.test(t)) return { reply: helpText(app) };
    if (app.interpret) {
      const hit = await app.interpret(t, extra);
      if (hit) return hit;
    }
    // Exact tool calls work everywhere: "crm.find dana" or "email.search {\"q\": \"invoice\"}".
    const exact = /^([a-z]+\.[a-z_]+)\s*(\{[\s\S]*\})?\s*$/i.exec(t);
    if (exact && app.tools.some((x) => x.name === exact[1])) return { tool: exact[1], input: J(exact[2], {}) };
    if (modelConfigured()) {
      try {
        const out = await chat({
          json: true,
          system: `You turn one request from a team member into one tool call for the ${app.id} app. Answer JSON {"tool": name, "input": {...}} or {"reply": "a short question back"} if it is unclear. Tools:\n${app.tools.map((x) => `- ${x.name}: ${x.description}${x.inputSchema ? ` Input: ${JSON.stringify(x.inputSchema)}` : ''}`).join('\n')}`,
          user: `The request (trusted, from a verified team member): ${t.slice(0, 2000)}${extra.forwarded ? `\n\nForwarded mail below the request:\n${untrusted({ from: extra.from, subject: extra.subject, text: extra.forwarded }, { max: 4000 })}` : ''}`,
        });
        if (out?.tool && app.tools.some((x) => x.name === out.tool)) return { tool: out.tool, input: out.input ?? {} };
        if (out?.reply) return { reply: String(out.reply) };
      } catch {}
    }
    return { reply: `I did not understand that.\n\n${helpText(app)}` };
  }

  async #describe(res, intent, member) {
    if (res?.status === 'needs_approval') {
      const ap = res.approval;
      if (ap.destructive) {
        const url = await this.signedLink(ap.id, member.email);
        return `This needs your yes, by clicking, not by replying: ${ap.summary}.\n\nConfirm here (the link works once, for 24 hours):\n${url}\n\nIf you did not ask for this, ignore this email and nothing happens.`;
      }
      await this.sendAlert({ to: member.email, title: `Approve: ${ap.summary}`, body: ap.reason, question: 'Approve this?', options: ['Yes', 'No'], app: 'approvals', ref: ap.id });
      return `This needs your yes: ${ap.summary}. I sent a separate email; reply "yes" to it to go ahead.`;
    }
    if (res?.error) return `That did not work: ${res.error}`;
    return res?.text ?? (typeof res === 'string' ? res : JSON.stringify(res?.result ?? res, null, 1).slice(0, 6000));
  }

  async #reply(p, text) {
    const subject = /^re:/i.test(p.subject) ? p.subject : `Re: ${p.subject || 'your message'}`;
    await this.#send({ to: p.replyTo?.address ?? p.from.address, subject, text, inReplyTo: p.messageId, references: [...p.references, p.messageId] });
  }

  // ---------- alerts (Lane B's suite core decides what to alert about; this sends them and reads the answers) ----------

  async sendAlert({ to, title, body = '', question = '', options = [], app = 'core', ref = null }) {
    const member = (await this.mailbox.memberByEmail(to)) ?? (await this.mailbox.members()).find((m) => m.id === to);
    if (!member) throw new Error(`Alerts go to team members only; ${to} is not one`);
    const acct = await this.commandAccount();
    if (!acct) throw new Error('Connect a command mailbox first (Settings, Run by email)');
    const alertId = id('al_', 10);
    const token = await issue(this.db, this.team, { kind: 'reply', subject_id: alertId, member: member.email });
    const [local, domain] = acct.address.split('@');
    const replyTo = `${local}+${token}@${domain}`;
    const messageId = `<${token}@${domain}>`;
    const opts = options.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
    const text = `${body ? `${body}\n\n` : ''}${question ? `${question}\n${opts ? `${opts}\n` : ''}\nReply with ${options.length ? `the number or the words${options.length === 2 && /^yes$/i.test(options[0]) ? ' (yes or no)' : ''}` : 'your answer'}. Only a reply from you, to this email, counts.` : ''}`;
    await this.db.run('INSERT INTO alerts (id, team_id, to_addr, app, ref, title, body, question, options, status, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [alertId, this.team, member.email, app, ref, title, body, question || null, JSON.stringify(options), question ? 'open' : 'sent', messageId, Date.now()]);
    await this.#send({ to: member.email, replyTo, messageId, subject: `[wOS] ${title}`, text });
    return { id: alertId, to: member.email, status: question ? 'open' : 'sent' };
  }

  async alerts({ status } = {}) {
    const rows = await this.db.all(`SELECT * FROM alerts WHERE team_id = ?${status ? ' AND status = ?' : ''} ORDER BY created_at DESC LIMIT 100`, status ? [this.team, status] : [this.team]);
    return rows.map((a) => ({ id: a.id, to: a.to_addr, app: a.app, ref: a.ref, title: a.title, question: a.question, options: J(a.options, []), status: a.status, answer: a.answer, answered_by: a.answered_by, created_at: a.created_at }));
  }

  async #answerAlert(alertId, text, actor) {
    const a = await this.db.get('SELECT * FROM alerts WHERE team_id = ? AND id = ?', [this.team, alertId]);
    if (!a) return { text: 'That alert no longer exists. Nothing was done.' };
    const options = J(a.options, []);
    const answer = parseAnswer(text, options);
    if (!answer) return { text: `I could not read an answer in your reply. Reply to the alert again with ${options.length ? options.map((o, i) => `${i + 1} (${o})`).join(' or ') : 'your answer'}.` };
    await this.db.run("UPDATE alerts SET status = 'answered', answer = ?, answered_by = ?, answered_at = ? WHERE id = ?", [answer, actor.email, Date.now(), a.id]);
    let result = `Got it: "${answer}".`;
    if (a.app === 'approvals') {
      const yes = /^(yes|approve|ok)$/i.test(answer);
      const out = await this.decide(a.ref, yes ? 'approve' : 'deny', actor);
      result = out.error ? `That could not be done: ${out.error}` : yes ? `Approved and done: ${out.approval.summary}.` : `Denied: ${out.approval.summary}. Nothing was done.`;
    } else {
      const fn = this.answerHandlers.get(a.app);
      if (fn) { try { const r = await fn({ ...a, options }, answer, actor); if (typeof r === 'string') result = r; } catch (e) { result = `Your answer was saved, but the ${a.app} app could not act on it: ${e.message}`; } }
    }
    this.emit('alert.answered', { alert: a.id, app: a.app, ref: a.ref, answer, by: actor.email });
    return { text: result, answer };
  }

  // ---------- approvals and signed links ----------

  // decide() is wired by lib/app.mjs to email.decide_approval, which runs the approved tool.
  setDecider(fn) { this.decide = fn; }
  decide() { throw new Error('No approval handler'); }

  async signedLink(approvalId, memberEmail) {
    const token = await issue(this.db, this.team, { kind: 'link', subject_id: approvalId, member: memberEmail });
    return `${this.publicUrl}/act/${token}`;
  }
  async peekLink(token) { return check(this.db, this.team, token, { kind: 'link' }); }
  async useLink(token) { return consume(this.db, this.team, token, { kind: 'link' }); }

  // ---------- the daily digest ----------

  async digestFor(member) {
    const since = Date.now() - 24 * 3600e3;
    const mb = this.mailbox;
    const acct = (await mb.accounts({ purpose: 'mailbox' })).find((a) => a.owner_id === member.id || a.address === member.email);
    const needs = acct ? (await mb.listThreads({ view: 'needs_you', account_id: acct.id, limit: 10 })) : [];
    const approvals = await mb.approvals();
    const cmds = await this.db.all('SELECT * FROM inbound_commands WHERE team_id = ? AND at > ? ORDER BY at DESC', [this.team, since]);
    const open = await this.alerts({ status: 'open' });
    const done = cmds.filter((c) => c.accepted);
    const refused = cmds.filter((c) => !c.accepted && !/^Ignored: sent automatically/.test(c.reason ?? ''));
    const lines = [
      `Good morning, ${member.name.split(' ')[0]}. Here is the last day in wOS.`,
      '',
      `Waiting for you`,
      `  ${needs.length} email${needs.length === 1 ? '' : 's'} that need you${needs.length ? ':' : ''}`,
      ...needs.slice(0, 5).map((t) => `   - ${t.subject} (${t.participants[0]?.name || t.participants[0]?.address || ''})`),
      `  ${approvals.length} approval${approvals.length === 1 ? '' : 's'}${approvals.length ? ':' : ''}`,
      ...approvals.slice(0, 5).map((a) => `   - ${a.summary}`),
      `  ${open.filter((a) => a.to === member.email).length} alert${open.length === 1 ? '' : 's'} not yet answered`,
      '',
      `What happened`,
      `  ${done.length} command${done.length === 1 ? '' : 's'} by email were done`,
      ...done.slice(0, 5).map((c) => `   - ${c.from_addr}: ${c.subject}`),
      ...(refused.length ? [`  ${refused.length} email${refused.length === 1 ? ' was' : 's were'} refused (not verified or not from the team)`] : []),
      '',
      `Open everything: ${this.publicUrl}`,
      `Write to this address to ask for anything. Send "help" for what works.`,
    ];
    return lines.join('\n');
  }

  async sendDigest({ to } = {}) {
    const members = (await this.mailbox.members()).filter((m) => !to || m.email === to || m.id === to);
    const acct = await this.commandAccount();
    if (!acct) throw new Error('Connect a command mailbox first (Settings, Run by email)');
    const day = new Date().toISOString().slice(0, 10);
    for (const m of members) await this.#send({ to: m.email, subject: `[wOS] Your daily digest, ${day}`, text: await this.digestFor(m) });
    return { sent: members.map((m) => m.email), day };
  }

  async maybeSendDigest(at = new Date()) {
    const s = await this.mailbox.settings();
    if (!s.digest_on || !s.run_by_email || !(await this.commandAccount())) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: s.digest_tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (Number(parts.hour) < Number(s.digest_hour) || s.last_digest_day === day) return null;
    await this.mailbox.setSettings({ last_digest_day: day });
    return this.sendDigest();
  }

  async commands(limit = 50) {
    const rows = await this.db.all('SELECT * FROM inbound_commands WHERE team_id = ? ORDER BY at DESC LIMIT ?', [this.team, limit]);
    return rows.map((c) => ({ id: c.id, at: c.at, from: c.from_addr, subject: c.subject, accepted: !!c.accepted, reason: c.reason, app: c.app, verified: J(c.verified, {}), result: c.result }));
  }

  get domain() { return domainOf(this.publicUrl); }
}

export function parseAnswer(text, options = []) {
  const first = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const w = first.toLowerCase().replace(/[.!]+$/, '').trim();
  if (!w) return null;
  const n = /^(\d+)\b/.exec(w)?.[1];
  if (n && options[Number(n) - 1]) return options[Number(n) - 1];
  const exact = options.find((o) => o.toLowerCase() === w || w.startsWith(`${o.toLowerCase()} `));
  if (exact) return exact;
  if (/^(yes|y|yep|yeah|approve|approved|ok|okay|go ahead|do it)\b/.test(w)) return options.find((o) => /^(yes|approve|ok)$/i.test(o)) ?? 'yes';
  if (/^(no|n|nope|deny|denied|stop|don't|do not|cancel)\b/.test(w)) return options.find((o) => /^(no|deny)$/i.test(o)) ?? 'no';
  return options.length ? null : first.slice(0, 500);
}

const stripPrefix = (s, appId) => String(s ?? '').replace(new RegExp(`^\\s*${appId}\\s*:\\s*`, 'i'), '').trim();

function helpText(app) {
  return `You can write to the ${app.id} app in plain words${modelConfigured() ? '' : ' or with these short commands'}.\n${app.describe ? `${app.describe}\n` : ''}\nTools it has:\n${app.tools.map((x) => `  ${x.name}: ${x.title ?? x.description}${x.confirm === 'human' ? ' (needs your yes)' : ''}`).join('\n')}`;
}
