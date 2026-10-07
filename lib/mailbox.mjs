// The email app's working parts: members, settings, accounts, sync and threading, threads, drafts, sending,
// approvals and the audit log. Tools (lib/tools.mjs) are the only way screens and agents reach these.
import { encrypt, decrypt, id } from './crypto.mjs';
import { ImapTransport } from './mail/imap.mjs';
import { parseRaw, snippetOf } from './mail/parse.mjs';
import { addrList, domainOf } from './mail/compose.mjs';
import { triage } from './triage.mjs';
import { chat, modelConfigured, untrusted } from './model.mjs';

export const DEFAULT_SETTINGS = {
  // Sending to anyone outside the team needs a person's yes when an agent asks (ROADMAP 5.4, section 4).
  send_outside_needs_yes: true,
  team_domains: [],
  rules: [],
  // Running wOS by email (ROADMAP 2.7).
  run_by_email: true,
  command_account: null,
  auth_policy: 'strict', // strict: SPF, DKIM and DMARC all pass. dmarc: DMARC pass is enough.
  trusted_authserv: '', // the receiving server whose Authentication-Results header we trust, e.g. mx.example.com
  digest_on: true,
  digest_hour: 8,
  digest_tz: 'UTC',
  last_digest_day: '',
};

const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const now = () => Date.now();

export class Mailbox {
  constructor({ db, blobs, env = process.env, team = 'default', memory = null, name = 'Email' }) {
    Object.assign(this, { db, blobs, env, team, memory, name });
  }

  // ---------- members ----------

  async members() { return this.db.all('SELECT * FROM members WHERE team_id = ? ORDER BY created_at', [this.team]); }
  async memberByEmail(email) { return this.db.get('SELECT * FROM members WHERE team_id = ? AND email = ?', [this.team, String(email).toLowerCase()]); }
  async addMember({ name, email, github, role = 'member' }) {
    const e = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(e)) throw new Error('That is not an email address');
    const have = await this.memberByEmail(e);
    if (have) return have;
    const m = { id: id('p_', 8), team_id: this.team, name: name || e.split('@')[0], email: e, github: github || null, role, created_at: now() };
    await this.db.run('INSERT INTO members (id, team_id, name, email, github, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', Object.values(m));
    return m;
  }
  async removeMember(memberId) {
    const m = await this.db.get('SELECT * FROM members WHERE team_id = ? AND id = ?', [this.team, memberId]);
    if (!m) throw new Error('No such member');
    if (m.role === 'owner' && (await this.members()).filter((x) => x.role === 'owner').length < 2) throw new Error('The last owner cannot be removed');
    await this.db.run('DELETE FROM members WHERE id = ?', [memberId]);
    return m;
  }
  // For sign-in (lib/auth.mjs).
  async team() { return (await this.members()).map((m) => ({ ...m, github: m.github || null })); }
  async personByGithub(login, emails = []) {
    const all = await this.members();
    return all.find((m) => m.github && m.github.toLowerCase() === String(login).toLowerCase()) ?? all.find((m) => emails.includes(m.email)) ?? null;
  }

  // ---------- settings ----------

  async settings() {
    const rows = await this.db.all('SELECT key, value FROM settings WHERE team_id = ?', [this.team]);
    const s = { ...DEFAULT_SETTINGS };
    for (const r of rows) s[r.key] = J(r.value, s[r.key]);
    return s;
  }
  async setSettings(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULT_SETTINGS)) throw new Error(`Unknown setting ${k}`);
      await this.db.run('INSERT INTO settings (team_id, key, value) VALUES (?, ?, ?) ON CONFLICT (team_id, key) DO UPDATE SET value = excluded.value', [this.team, k, JSON.stringify(v)]);
    }
    return this.settings();
  }

  async outsiders(addresses) {
    const s = await this.settings();
    const members = new Set((await this.members()).map((m) => m.email));
    const domains = new Set(s.team_domains.map((d) => d.toLowerCase()));
    return addrList(addresses).filter((a) => !members.has(a) && !domains.has(domainOf(a)));
  }

  // ---------- accounts ----------

  async connectAccount({ kind = 'imap', address, name, imap, smtp, purpose = 'mailbox', owner_id = null, test = true }) {
    const addr = String(address ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(addr)) throw new Error('Give the mailbox address');
    if (kind === 'imap' && (!imap?.host || !smtp?.host)) throw new Error('Give the IMAP and SMTP server names (your mail provider lists them)');
    if (kind === 'memory' && !this.memory) throw new Error('The in-memory mail server only exists in the demo and tests');
    const auth = kind === 'imap' ? { imap, smtp } : {};
    const acct = { id: id('a_', 8), team_id: this.team, owner_id, kind, purpose, address: addr, name: name || null, auth: encrypt(auth, this.env), sync_state: '{}', created_at: now() };
    if (test) await this.transport(acct).verify();
    await this.db.run('INSERT INTO mail_accounts (id, team_id, owner_id, kind, purpose, address, name, auth, sync_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [acct.id, acct.team_id, acct.owner_id, acct.kind, acct.purpose, acct.address, acct.name, acct.auth, acct.sync_state, acct.created_at]);
    if (purpose === 'commands') await this.setSettings({ command_account: acct.id });
    return this.publicAccount(acct);
  }

  // What anyone outside this file sees of an account: never the password, not even encrypted.
  publicAccount(a) {
    return { id: a.id, kind: a.kind, purpose: a.purpose, address: a.address, name: a.name, owner_id: a.owner_id, last_sync_at: a.last_sync_at ?? null, last_error: a.last_error ?? null };
  }

  async accounts({ purpose } = {}) {
    const rows = await this.db.all(`SELECT * FROM mail_accounts WHERE team_id = ?${purpose ? ' AND purpose = ?' : ''} ORDER BY created_at`, purpose ? [this.team, purpose] : [this.team]);
    return rows;
  }
  async account(accountId) {
    const a = await this.db.get('SELECT * FROM mail_accounts WHERE team_id = ? AND id = ?', [this.team, accountId]);
    if (!a) throw new Error(`No account ${accountId}`);
    return a;
  }
  async defaultAccount(person) {
    const all = await this.accounts({ purpose: 'mailbox' });
    return all.find((a) => person && (a.owner_id === person.id || a.address === person.email)) ?? all[0] ?? null;
  }
  async disconnectAccount(accountId) {
    const a = await this.account(accountId);
    const msgs = await this.db.all('SELECT body_ref FROM mail_messages WHERE account_id = ?', [a.id]);
    for (const m of msgs) if (m.body_ref) await this.blobs.del(m.body_ref);
    for (const t of ['mail_messages', 'mail_threads', 'mail_drafts']) await this.db.run(`DELETE FROM ${t} WHERE account_id = ?`, [a.id]);
    await this.db.run('DELETE FROM mail_accounts WHERE id = ?', [a.id]);
    const s = await this.settings();
    if (s.command_account === a.id) await this.setSettings({ command_account: null });
    return this.publicAccount(a);
  }

  transport(acct) {
    if (acct.kind === 'memory') return this.memory.transport(acct.address);
    if (acct.kind === 'imap') return new ImapTransport(acct.address, decrypt(acct.auth, this.env));
    throw new Error(`Accounts of kind ${acct.kind} are not supported yet`);
  }

  // ---------- sync ----------

  async sync(accountId) {
    const list = accountId ? [await this.account(accountId)] : await this.accounts({ purpose: 'mailbox' });
    const out = [];
    for (const a of list) {
      try {
        const { messages, state } = await this.transport(a).fetchNew(J(a.sync_state, {}));
        let added = 0;
        for (const m of messages) if (await this.ingest(a, m)) added++;
        await this.db.run('UPDATE mail_accounts SET sync_state = ?, last_sync_at = ?, last_error = NULL WHERE id = ?', [JSON.stringify(state), now(), a.id]);
        out.push({ account: a.address, added });
      } catch (e) {
        await this.db.run('UPDATE mail_accounts SET last_error = ? WHERE id = ?', [String(e.message).slice(0, 300), a.id]);
        out.push({ account: a.address, error: e.message });
      }
    }
    return out;
  }

  async ingest(acct, { uid, raw, seen = false, folder = 'INBOX' }) {
    const p = await parseRaw(raw);
    if (await this.db.get('SELECT id FROM mail_messages WHERE account_id = ? AND message_id = ?', [acct.id, p.messageId])) return null;
    const mine = p.from.address === acct.address;
    const threadId = await this.threadFor(acct, p);
    const s = await this.settings();
    const msgId = id('msg_', 10);
    await this.blobs.put(msgId, { text: p.text, html: p.html });
    await this.db.run(`INSERT INTO mail_messages (id, team_id, thread_id, account_id, message_id, in_reply_to, refs, direction, from_addr, from_name, to_json, cc_json, subject, date, snippet, search_text, body_ref, has_attachments, attachments, list_unsubscribe, folder, uid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [msgId, this.team, threadId.id, acct.id, p.messageId, p.inReplyTo, JSON.stringify(p.references), mine ? 'out' : 'in', p.from.address, p.from.name, JSON.stringify(p.to), JSON.stringify(p.cc), p.subject, p.date, snippetOf(p.text),
      `${p.subject}\n${p.from.name} ${p.from.address}\n${p.to.map((x) => x.address).join(' ')}\n${p.text}`.toLowerCase().slice(0, 8000), msgId, p.attachments.length ? 1 : 0, JSON.stringify(p.attachments), p.listUnsubscribe, folder, uid ?? null]);
    if (threadId.created) {
      const t = mine ? { triage: 'fyi', by: 'rules', reason: 'You started this thread' } : await triage(p, { rules: s.rules, me: acct.address, env: this.env });
      await this.db.run(`INSERT INTO mail_threads (id, team_id, account_id, subject, last_at, triage, triage_by, triage_reason, unread, participants, message_count, snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [threadId.id, this.team, acct.id, p.subject || '(no subject)', p.date, t.triage, t.by, t.reason, seen || mine ? 0 : 1, JSON.stringify(uniq([p.from, ...p.to, ...p.cc])), snippetOf(p.text)]);
    } else {
      const th = await this.db.get('SELECT * FROM mail_threads WHERE id = ?', [threadId.id]);
      const people = uniq([...J(th.participants, []), p.from, ...p.to, ...p.cc]);
      // A new message from someone else brings an archived thread back to the inbox, as Gmail does.
      await this.db.run('UPDATE mail_threads SET last_at = ?, message_count = message_count + 1, participants = ?, snippet = ?, unread = ?, archived = ? WHERE id = ?',
        [Math.max(th.last_at, p.date), JSON.stringify(people), snippetOf(p.text), mine ? th.unread : 1, mine ? th.archived : 0, th.id]);
    }
    return { id: msgId, thread_id: threadId.id };
  }

  async threadFor(acct, p) {
    const keys = [p.inReplyTo, ...p.references].filter(Boolean);
    if (keys.length) {
      const hit = await this.db.get(`SELECT thread_id FROM mail_messages WHERE account_id = ? AND message_id IN (${keys.map(() => '?').join(',')}) LIMIT 1`, [acct.id, ...keys]);
      if (hit) return { id: hit.thread_id, created: false };
    }
    return { id: id('t_', 10), created: true };
  }

  // ---------- threads ----------

  async listThreads({ view = 'needs_you', q = '', limit = 50, account_id, label } = {}) {
    const where = ['team_id = ?', 'deleted = 0'];
    const args = [this.team];
    const t = now();
    if (account_id) { where.push('account_id = ?'); args.push(account_id); }
    else { const acc = (await this.accounts({ purpose: 'mailbox' })).map((a) => a.id); if (!acc.length) return []; where.push(`account_id IN (${acc.map(() => '?').join(',')})`); args.push(...acc); }
    if (view === 'archived') where.push('archived = 1');
    else if (view === 'snoozed') { where.push('archived = 0 AND snoozed_until > ?'); args.push(t); }
    else if (view !== 'search') {
      where.push('archived = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?)'); args.push(t);
      if (['needs_you', 'fyi', 'news'].includes(view)) { where.push('triage = ?'); args.push(view); }
    }
    if (label) { where.push('labels LIKE ?'); args.push(`%"${label}"%`); }
    if (q) {
      const words = String(q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
      for (const w of words) { where.push('id IN (SELECT thread_id FROM mail_messages WHERE search_text LIKE ?)'); args.push(`%${w}%`); }
    }
    const rows = await this.db.all(`SELECT * FROM mail_threads WHERE ${where.join(' AND ')} ORDER BY last_at DESC LIMIT ${Math.min(Number(limit) || 50, 200)}`, args);
    return rows.map(threadOut);
  }

  async counts() {
    const t = now();
    const acc = (await this.accounts({ purpose: 'mailbox' })).map((a) => a.id);
    if (!acc.length) return { needs_you: 0, fyi: 0, news: 0, all: 0 };
    const rows = await this.db.all(`SELECT triage, COUNT(*) AS n FROM mail_threads WHERE team_id = ? AND deleted = 0 AND archived = 0 AND (snoozed_until IS NULL OR snoozed_until <= ?) AND account_id IN (${acc.map(() => '?').join(',')}) GROUP BY triage`, [this.team, t, ...acc]);
    const c = { needs_you: 0, fyi: 0, news: 0 };
    for (const r of rows) c[r.triage] = Number(r.n);
    c.all = c.needs_you + c.fyi + c.news;
    c.approvals = Number((await this.db.get("SELECT COUNT(*) AS n FROM approvals WHERE team_id = ? AND status = 'pending'", [this.team])).n);
    c.drafts = Number((await this.db.get("SELECT COUNT(*) AS n FROM mail_drafts WHERE team_id = ? AND status IN ('draft', 'waiting')", [this.team])).n);
    return c;
  }

  async thread(threadId) {
    const t = await this.db.get('SELECT * FROM mail_threads WHERE team_id = ? AND id = ? AND deleted = 0', [this.team, threadId]);
    if (!t) throw new Error(`No thread ${threadId}`);
    return t;
  }

  async readThread(threadId, { markRead = true } = {}) {
    const t = await this.thread(threadId);
    const rows = await this.db.all('SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY date', [t.id]);
    const messages = [];
    for (const m of rows) {
      const body = (await this.blobs.get(m.body_ref)) ?? { text: m.snippet };
      messages.push({ id: m.id, message_id: m.message_id, direction: m.direction, from: { address: m.from_addr, name: m.from_name }, to: J(m.to_json, []), cc: J(m.cc_json, []), date: m.date, subject: m.subject, text: body.text, attachments: J(m.attachments, []), list_unsubscribe: !!m.list_unsubscribe });
    }
    const drafts = (await this.db.all("SELECT * FROM mail_drafts WHERE thread_id = ? AND status IN ('draft', 'waiting') ORDER BY created_at", [t.id])).map(draftOut);
    if (markRead && t.unread) await this.markRead(t.id, true);
    return { thread: threadOut({ ...t, unread: markRead ? 0 : t.unread }), messages, drafts };
  }

  async #lastInbound(t) { return this.db.get("SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY date DESC LIMIT 1", [t.id]); }

  async markRead(threadId, read = true) {
    const t = await this.thread(threadId);
    await this.db.run('UPDATE mail_threads SET unread = ? WHERE id = ?', [read ? 0 : 1, t.id]);
    if (read) {
      const acct = await this.account(t.account_id);
      const msgs = await this.db.all("SELECT message_id, uid FROM mail_messages WHERE thread_id = ? AND direction = 'in'", [t.id]);
      for (const m of msgs) await this.transport(acct).markSeen({ uid: m.uid, messageId: m.message_id }).catch(() => {});
    }
    return threadOut({ ...t, unread: read ? 0 : 1 });
  }

  async archive(threadId, archived = true) {
    const t = await this.thread(threadId);
    const acct = await this.account(t.account_id);
    const msgs = await this.db.all("SELECT message_id, uid FROM mail_messages WHERE thread_id = ? AND direction = 'in'", [t.id]);
    for (const m of msgs) await this.transport(acct)[archived ? 'archive' : 'unarchive']({ uid: m.uid, messageId: m.message_id }).catch(() => {});
    await this.db.run('UPDATE mail_threads SET archived = ?, snoozed_until = NULL WHERE id = ?', [archived ? 1 : 0, t.id]);
    return threadOut({ ...t, archived: archived ? 1 : 0 });
  }

  async label(threadId, { add = [], remove = [] }) {
    const t = await this.thread(threadId);
    const labels = [...new Set([...J(t.labels, []), ...add.map((x) => String(x).trim().toLowerCase()).filter(Boolean)])].filter((l) => !remove.map((x) => x.toLowerCase()).includes(l));
    await this.db.run('UPDATE mail_threads SET labels = ? WHERE id = ?', [JSON.stringify(labels), t.id]);
    return threadOut({ ...t, labels: JSON.stringify(labels) });
  }

  async snooze(threadId, until) {
    const t = await this.thread(threadId);
    const at = until ? new Date(until).getTime() : null;
    if (until && !(at > 0)) throw new Error('Give a date and time like 2026-10-09T09:00');
    await this.db.run('UPDATE mail_threads SET snoozed_until = ? WHERE id = ?', [at, t.id]);
    return threadOut({ ...t, snoozed_until: at });
  }

  async setTriage(threadId, bucket, reason = 'Set by hand') {
    const t = await this.thread(threadId);
    await this.db.run("UPDATE mail_threads SET triage = ?, triage_by = 'person', triage_reason = ? WHERE id = ?", [bucket, reason, t.id]);
    return threadOut({ ...t, triage: bucket, triage_by: 'person', triage_reason: reason });
  }

  async retriage(threadId) {
    const t = await this.thread(threadId);
    const acct = await this.account(t.account_id);
    const first = await this.db.get("SELECT * FROM mail_messages WHERE thread_id = ? AND direction = 'in' ORDER BY date LIMIT 1", [t.id]);
    if (!first) return threadOut(t);
    const body = (await this.blobs.get(first.body_ref)) ?? { text: first.snippet };
    const s = await this.settings();
    const r = await triage({ from: { address: first.from_addr, name: first.from_name }, to: J(first.to_json, []), cc: J(first.cc_json, []), subject: first.subject, text: body.text, listUnsubscribe: first.list_unsubscribe }, { rules: s.rules, me: acct.address, env: this.env });
    await this.db.run('UPDATE mail_threads SET triage = ?, triage_by = ?, triage_reason = ? WHERE id = ?', [r.triage, r.by, r.reason, t.id]);
    return threadOut({ ...t, triage: r.triage, triage_by: r.by, triage_reason: r.reason });
  }

  async deleteThread(threadId) {
    const t = await this.thread(threadId);
    const acct = await this.account(t.account_id);
    const msgs = await this.db.all("SELECT message_id, uid FROM mail_messages WHERE thread_id = ? AND direction = 'in'", [t.id]);
    for (const m of msgs) await this.transport(acct).trash({ uid: m.uid, messageId: m.message_id }).catch(() => {});
    await this.db.run('UPDATE mail_threads SET deleted = 1 WHERE id = ?', [t.id]);
    return threadOut(t);
  }

  // ---------- drafts and sending ----------

  async draft({ draft_id, thread_id, account_id, to, cc, subject, body, ai = false, instructions = '', by = { kind: 'person', id: null }, person }) {
    if (draft_id) {
      const d = await this.getDraft(draft_id);
      const next = { to: to ? addrList(to) : J(d.to_json, []), cc: cc ? addrList(cc) : J(d.cc_json, []), subject: subject ?? d.subject, body: body ?? d.body };
      if (ai || (!body && instructions)) {
        const thread = d.thread_id ? await this.thread(d.thread_id) : null;
        next.body = await this.writeDraft({ thread, acct: await this.account(d.account_id), instructions, person });
        await this.db.run("UPDATE mail_drafts SET created_by_kind = 'agent' WHERE id = ?", [d.id]);
      }
      await this.db.run("UPDATE mail_drafts SET to_json = ?, cc_json = ?, subject = ?, body = ?, updated_at = ?, status = 'draft', approval_id = NULL WHERE id = ?", [JSON.stringify(next.to), JSON.stringify(next.cc), next.subject, next.body, now(), d.id]);
      return this.getDraft(d.id).then(draftOut);
    }
    let acct, thread, last;
    if (thread_id) {
      thread = await this.thread(thread_id);
      acct = await this.account(thread.account_id);
      last = await this.#lastInbound(thread);
    } else acct = account_id ? await this.account(account_id) : await this.defaultAccount(person);
    if (!acct) throw new Error('Connect a mailbox first');
    let toList = to ? addrList(to) : [];
    let ccList = cc ? addrList(cc) : [];
    if (thread && !to) {
      const lastIn = await this.db.get("SELECT * FROM mail_messages WHERE thread_id = ? AND direction = 'in' ORDER BY date DESC LIMIT 1", [thread.id]);
      toList = lastIn ? [lastIn.from_addr] : J(last?.to_json, []).map((a) => a.address);
    }
    const subj = subject ?? (thread ? (/^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`) : '');
    let text = body ?? '';
    let written = by.kind;
    if (ai || (!body && instructions)) {
      text = await this.writeDraft({ thread, acct, instructions, person });
      written = 'agent';
    }
    const d = { id: id('d_', 10), team_id: this.team, account_id: acct.id, thread_id: thread?.id ?? null, to_json: JSON.stringify(toList), cc_json: JSON.stringify(ccList), subject: subj, body: text, created_by_kind: written === 'agent' || by.kind === 'agent' ? 'agent' : 'person', created_by: by.id, status: 'draft', created_at: now(), updated_at: now() };
    await this.db.run('INSERT INTO mail_drafts (id, team_id, account_id, thread_id, to_json, cc_json, subject, body, created_by_kind, created_by, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', Object.values(d));
    return draftOut(d);
  }

  // The AI writes; a person sends. Outside mail goes to the model only as marked, untrusted data.
  async writeDraft({ thread, acct, instructions, person }) {
    const signer = person?.name?.split(' ')[0] || acct.name?.split(' ')[0] || '';
    let history = [];
    if (thread) history = (await this.readThread(thread.id, { markRead: false })).messages.slice(-4);
    if (modelConfigured(this.env)) {
      try {
        const out = await chat({
          env: this.env,
          system: `You write email replies for ${signer || 'the user'} (${acct.address}). Plain text, short, warm and direct, no subject line, sign off with "${signer}". Write only the body. Never promise anything the person has not said.`,
          user: `${history.map((m) => (m.direction === 'out' ? `Earlier reply from ${acct.address}:\n${m.text.slice(0, 2000)}` : untrusted(m, { max: 3000 }))).join('\n\n')}\n\nWhat the person wants this reply to say (trusted, from the person): ${instructions || 'a helpful reply'}`,
        });
        if (out) return out.trim();
      } catch {}
    }
    // No model connected: a plain starting point the person edits.
    const last = history.filter((m) => m.direction === 'in').pop();
    const first = last?.from?.name?.split(' ')[0] || '';
    return `Hi${first ? ` ${first}` : ''},\n\n${instructions ? `${instructions.charAt(0).toUpperCase()}${instructions.slice(1)}${/[.!?]$/.test(instructions) ? '' : '.'}` : 'Thanks for your note. I will get back to you shortly.'}\n\nBest,\n${signer}`;
  }

  async getDraft(draftId) {
    const d = await this.db.get('SELECT * FROM mail_drafts WHERE team_id = ? AND id = ?', [this.team, draftId]);
    if (!d) throw new Error(`No draft ${draftId}`);
    return d;
  }
  async listDrafts() { return (await this.db.all("SELECT * FROM mail_drafts WHERE team_id = ? AND status IN ('draft', 'waiting') ORDER BY updated_at DESC", [this.team])).map(draftOut); }
  async discardDraft(draftId) {
    const d = await this.getDraft(draftId);
    await this.db.run("UPDATE mail_drafts SET status = 'discarded' WHERE id = ?", [d.id]);
    if (d.approval_id) await this.db.run("UPDATE approvals SET status = 'withdrawn' WHERE id = ? AND status = 'pending'", [d.approval_id]);
    return draftOut({ ...d, status: 'discarded' });
  }

  async sendDraft(draftId) {
    const d = await this.getDraft(draftId);
    if (d.status === 'sent') throw new Error('That draft was already sent');
    if (d.status === 'discarded') throw new Error('That draft was discarded');
    const to = J(d.to_json, []);
    if (!to.length) throw new Error('Add someone to send it to');
    const acct = await this.account(d.account_id);
    let inReplyTo, references = [];
    if (d.thread_id) {
      const last = await this.#lastInbound({ id: d.thread_id });
      if (last) { inReplyTo = last.message_id; references = [...J(last.refs, []), last.message_id]; }
    }
    const sent = await this.transport(acct).send({ from: acct.name ? { name: acct.name, address: acct.address } : acct.address, to, cc: J(d.cc_json, []), subject: d.subject, text: d.body, inReplyTo, references });
    const msg = await this.ingest(acct, { raw: sent.raw, seen: true, folder: 'Sent' });
    await this.db.run("UPDATE mail_drafts SET status = 'sent', sent_message_id = ?, updated_at = ? WHERE id = ?", [sent.messageId, now(), d.id]);
    return { draft_id: d.id, message_id: sent.messageId, thread_id: msg?.thread_id ?? d.thread_id, to };
  }

  // ---------- approvals ----------

  async requestApproval({ tool, input, summary, reason, destructive = false, actor }) {
    const a = { id: id('ap_', 10), team_id: this.team, tool, input: JSON.stringify(input), summary, reason, destructive: destructive ? 1 : 0, requested_by: actor?.name ?? null, requested_kind: actor?.kind ?? 'agent', status: 'pending', created_at: now() };
    await this.db.run('INSERT INTO approvals (id, team_id, tool, input, summary, reason, destructive, requested_by, requested_kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', Object.values(a));
    return approvalOut(a);
  }
  async approvals({ status = 'pending' } = {}) {
    return (await this.db.all(`SELECT * FROM approvals WHERE team_id = ?${status === 'all' ? '' : ' AND status = ?'} ORDER BY created_at DESC LIMIT 100`, status === 'all' ? [this.team] : [this.team, status])).map(approvalOut);
  }
  async approval(approvalId) {
    const a = await this.db.get('SELECT * FROM approvals WHERE team_id = ? AND id = ?', [this.team, approvalId]);
    if (!a) throw new Error(`No approval ${approvalId}`);
    return a;
  }
  async closeApproval(approvalId, { status, by, result }) {
    await this.db.run('UPDATE approvals SET status = ?, decided_by = ?, decided_at = ?, result = ? WHERE id = ?', [status, by ?? null, now(), result == null ? null : JSON.stringify(result).slice(0, 4000), approvalId]);
    return approvalOut(await this.approval(approvalId));
  }

  // ---------- audit ----------

  async audit({ actor, tool, outcome, detail }) {
    await this.db.run('INSERT INTO audit_log (id, team_id, at, actor, actor_kind, channel, tool, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id('au_', 10), this.team, now(), actor?.name ?? null, actor?.kind ?? null, actor?.channel ?? null, tool, outcome, detail ? String(detail).slice(0, 500) : null]);
  }
  async auditLog(limit = 50) { return this.db.all('SELECT at, actor, actor_kind, channel, tool, outcome, detail FROM audit_log WHERE team_id = ? ORDER BY at DESC LIMIT ?', [this.team, limit]); }
}

const uniq = (list) => { const seen = new Set(); return list.filter((a) => a?.address && !seen.has(a.address) && seen.add(a.address)); };

export function threadOut(t) {
  return { id: t.id, account_id: t.account_id, subject: t.subject, last_at: t.last_at, triage: t.triage, triage_by: t.triage_by, triage_reason: t.triage_reason, labels: J(t.labels, []), snoozed_until: t.snoozed_until ?? null, archived: !!t.archived, unread: !!t.unread, participants: J(t.participants, []), message_count: t.message_count, snippet: t.snippet };
}
export function draftOut(d) {
  return { id: d.id, account_id: d.account_id, thread_id: d.thread_id, to: J(d.to_json, []), cc: J(d.cc_json, []), subject: d.subject, body: d.body, written_by: d.created_by_kind, status: d.status, approval_id: d.approval_id ?? null };
}
export function approvalOut(a) {
  return { id: a.id, tool: a.tool, input: J(a.input, {}), summary: a.summary, reason: a.reason, destructive: !!a.destructive, requested_by: a.requested_by, requested_kind: a.requested_kind, status: a.status, decided_by: a.decided_by ?? null, created_at: a.created_at };
}
