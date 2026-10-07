// The email app in one object: storage, mailbox work, the tool runner with its human gate, and
// run-by-email with the email app registered as its default.
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { openDb } from './db.mjs';
import { openBlobs } from './blobs.mjs';
import { Mailbox } from './mailbox.mjs';
import { TOOLS, TOOL_MAP } from './tools.mjs';
import { RunByEmail } from './runbyemail/index.mjs';

export class EmailApp extends EventEmitter {
  constructor({ db, blobs, env = process.env, team = 'default', memory = null, name, publicUrl, resolver }) {
    super();
    this.env = env;
    this.mb = new Mailbox({ db, blobs, env, team, memory, name: name ?? env.EMAIL_NAME ?? 'Email' });
    this.rbe = new RunByEmail({ mailbox: this.mb, publicUrl: publicUrl ?? env.PUBLIC_URL, resolver });
    this.rbe.setDecider((approvalId, decision, actor) => this.decide(approvalId, decision, actor));
    this.rbe.registerApp('email', {
      describe: 'Short commands: "inbox", "search <words>", "read <thread id>", "archive <thread id>", "draft <thread id> <what to say>", "send <draft id>", "delete <thread id>", "digest".',
      tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, confirm: t.confirm })),
      call: (name, input, ctx) => this.callTool(name, input, { actor: ctx.actor, person: ctx.actor }),
      interpret: emailCommand,
    });
  }

  get db() { return this.mb.db; }

  // Runs one tool for someone. actor: { kind: 'person' | 'agent', channel: 'web' | 'mcp' | 'rest' | 'email' | 'link', name }.
  // person: the team member the call acts for (whose mailbox it reaches).
  async callTool(name, input = {}, { actor, person, approval = null } = {}) {
    const t = TOOL_MAP.get(name);
    if (!t) return { ok: false, status: 'error', error: `No tool called ${name}` };
    const parsed = z.object(t.input).safeParse(input ?? {});
    if (!parsed.success) return { ok: false, status: 'error', error: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') };
    const who = person ? await this.#member(person) : null;
    const ctx = {
      app: this, mb: this.mb, rbe: this.rbe, actor, person: who, approval,
      emit: (ev, data) => this.emit(ev, data),
      // The human gate (ROADMAP 3.1, point 4). A person pressing the button in the app is the yes.
      // Anyone else (an agent over MCP or REST, a command by email) gets an approval request instead.
      needsYes: async (info) => {
        if (approval && approval.tool === info.tool) return null;
        if (actor?.kind === 'person' && actor.channel === 'web') return null;
        return this.mb.requestApproval({ ...info, actor: { ...actor, name: who?.id ?? actor?.name } });
      },
    };
    try {
      const out = await t.run(ctx, parsed.data);
      const status = out.status ?? 'done';
      await this.mb.audit({ actor, tool: name, outcome: status, detail: out.text?.split('\n')[0] });
      return { ok: true, status, ...out };
    } catch (e) {
      await this.mb.audit({ actor, tool: name, outcome: 'error', detail: e.message });
      return { ok: false, status: 'error', error: e.message };
    }
  }

  async #member(p) {
    if (p.id && p.email && p.role) return p;
    return (p.email && (await this.mb.memberByEmail(p.email))) || (await this.mb.members()).find((m) => m.id === p.id) || null;
  }

  // Approve or deny. Approving is for people only: in the app, by a signed link, or by replying to an
  // approval email, and never by reply for anything destructive.
  async decide(approvalId, decision, actor) {
    let ap;
    try { ap = await this.mb.approval(approvalId); } catch (e) { return { ok: false, status: 'error', error: e.message }; }
    if (ap.status !== 'pending') return { ok: false, status: 'error', error: `That was already ${ap.status}` };
    if (decision === 'deny') {
      const out = await this.mb.closeApproval(ap.id, { status: 'denied', by: actor?.name });
      await this.db.run("UPDATE mail_drafts SET status = 'draft', approval_id = NULL WHERE approval_id = ?", [ap.id]);
      await this.mb.audit({ actor, tool: 'email.decide_approval', outcome: 'denied', detail: ap.summary });
      return { ok: true, status: 'done', approval: out, result: out, text: `Denied: ${ap.summary}` };
    }
    if (actor?.kind !== 'person') return { ok: false, status: 'error', error: 'Only a person can approve. Ask them to open Approvals in the app, or use the link in their email.' };
    if (!['web', 'link', 'email'].includes(actor.channel)) return { ok: false, status: 'error', error: 'Approve in the app or with the signed link.' };
    if (ap.destructive && actor.channel === 'email') return { ok: false, status: 'error', error: 'This one needs a click on the signed link, not a reply' };
    const requester = (await this.mb.members()).find((m) => m.id === ap.requested_by) ?? (await this.#member(actor));
    const run = await this.callTool(ap.tool, JSON.parse(ap.input), { actor, person: requester, approval: { id: ap.id, tool: ap.tool } });
    const out = await this.mb.closeApproval(ap.id, { status: run.ok ? 'approved' : 'failed', by: actor.name, result: run.ok ? run.text : run.error });
    if (!run.ok) return { ok: false, status: 'error', error: run.error, approval: out };
    return { ok: true, status: 'done', approval: out, result: { approval: out, done: run.result }, text: `Approved: ${ap.summary}. ${run.text ?? ''}`.trim() };
  }
}

// The email app's short commands by email. Anything else falls through to exact tool names or the model.
export function emailCommand(text) {
  const t = text.trim();
  const w = t.toLowerCase();
  let m;
  if (/^(inbox|needs you|what needs me\??|what's waiting\??)$/.test(w)) return { tool: 'email.list_threads', input: { view: 'needs_you' } };
  if (/^(fyi|newsletters|news)$/.test(w)) return { tool: 'email.list_threads', input: { view: w === 'fyi' ? 'fyi' : 'news' } };
  if ((m = /^(?:search|find)\s+(.+)$/i.exec(t))) return { tool: 'email.search', input: { q: m[1] } };
  if ((m = /^read\s+(t_[a-z2-9]+)$/i.exec(t))) return { tool: 'email.read_thread', input: { thread_id: m[1] } };
  if ((m = /^archive\s+(t_[a-z2-9]+)$/i.exec(t))) return { tool: 'email.archive', input: { thread_id: m[1] } };
  if ((m = /^delete\s+(t_[a-z2-9]+)$/i.exec(t))) return { tool: 'email.delete_thread', input: { thread_id: m[1] } };
  if ((m = /^snooze\s+(t_[a-z2-9]+)\s+(.+)$/i.exec(t))) return { tool: 'email.snooze', input: { thread_id: m[1], until: m[2] } };
  if ((m = /^draft\s+(t_[a-z2-9]+)\s*(.*)$/is.exec(t))) return { tool: 'email.draft', input: { thread_id: m[1], ai: true, instructions: m[2] } };
  if ((m = /^send\s+(d_[a-z2-9]+)$/i.exec(t))) return { tool: 'email.send', input: { draft_id: m[1] } };
  if (/^(digest|send (me )?the digest)$/.test(w)) return { tool: 'email.send_digest', input: {} };
  return null;
}

// Everything wired from the environment: the server, the Vercel function and tests all start here.
export async function createEmailApp({ env = process.env, db, blobs, memory = null, resolver, publicUrl } = {}) {
  db ??= await openDb({ url: env.DATABASE_URL, file: env.SQLITE_FILE ?? (env.WOS_DEMO ? ':memory:' : env.DATABASE_URL ? undefined : './data/email.sqlite') });
  blobs ??= openBlobs(env.WOS_DEMO ? undefined : env.FILES_DIR ?? (env.DATABASE_URL ? undefined : './data/files'));
  const app = new EmailApp({ db, blobs, env, memory, publicUrl, resolver });
  await seedMembers(app, env);
  return app;
}

// First members from the environment, so a fresh self-hosted install has an owner:
//   TEAM_MEMBERS="Sam Rivera <sam@acme.example> @samgh owner, Jordan Lee <jordan@acme.example>"
async function seedMembers(app, env) {
  if (!env.TEAM_MEMBERS || (await app.mb.members()).length) return;
  for (const part of env.TEAM_MEMBERS.split(',')) {
    const email = /<([^>]+)>/.exec(part)?.[1] ?? /\S+@\S+/.exec(part)?.[0];
    if (!email) continue;
    await app.mb.addMember({ name: part.split('<')[0].trim() || undefined, email, github: /@([A-Za-z0-9-]+)(\s|$)/.exec(part.replace(/<[^>]+>/, ''))?.[1], role: /\bowner\b/.test(part) ? 'owner' : /\badmin\b/.test(part) ? 'admin' : 'member' });
  }
}
