// The server part the wOS suite loads (packages/manifest, section 4): register(ctx) -> { handlers, routes,
// start, stop, exportTeam }. The same tool code as the standalone app (standalone.mjs), one EmailApp per team.
//
// Inside the suite:
//   - the suite checks sign-in, team, scope and input, and asks a person before any confirm: human tool
//     runs for an agent, so handlers here run with that yes already given;
//   - people come from the suite's team (call.actor), mailboxes belong to call.actor.personId;
//   - signed links for run-by-email live under /hooks/email/act/<token>, the only non-tool traffic.
import path from 'node:path';
import { EmailApp } from './lib/app.mjs';
import { openBlobs } from './lib/blobs.mjs';
import { TOOLS } from './lib/tools.mjs';
import { handleSignedLink } from './lib/http.mjs';

const EVENTS = ['email.message.received', 'email.message.sent', 'email.command.received', 'email.alert.answered'];

export default function register(ctx) {
  const env = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? ctx.env(k) : undefined) });
  const db = {
    dialect: ctx.db.dialect,
    all: (sql, params) => ctx.db.query(sql, params),
    query: (sql, params) => ctx.db.query(sql, params),
    get: async (sql, params) => (await ctx.db.get(sql, params)) ?? null,
    run: (sql, params) => ctx.db.run(sql, params),
    tx: (fn) => ctx.db.tx(fn),
  };
  const blobs = openBlobs(path.join(ctx.dataDir, 'email'));
  const apps = new Map();

  function appFor(teamId) {
    if (!apps.has(teamId)) {
      const app = new EmailApp({ db, blobs, env, team: teamId, publicUrl: ctx.publicUrl });
      for (const ev of EVENTS) app.on(ev, (data) => ctx.events.publish(teamId, ev, data));
      apps.set(teamId, app);
    }
    return apps.get(teamId);
  }

  const personOf = (call) => ({
    id: call.actor.personId ?? call.actor.id,
    name: call.actor.name,
    role: call.scopes.includes('admin') ? 'admin' : 'member',
  });
  const actorOf = (call) => ({
    kind: call.actor.kind === 'person' ? 'person' : 'agent',
    channel: call.via === 'screen' ? 'web' : call.via,
    name: call.actor.name,
    id: call.actor.id,
  });

  const handlers = {};
  for (const t of TOOLS) {
    handlers[t.name] = async (input, call) => {
      const app = appFor(call.team.id);
      // The suite already asked a person when this tool needs a yes, so the gate here is open.
      const out = await app.callTool(t.name, input, { actor: actorOf(call), person: personOf(call), approval: { id: 'suite', tool: t.name } });
      if (!out.ok) throw new Error(out.error);
      return out.result;
    };
  }

  let timers = [];
  const teams = async () => (await ctx.db.query('SELECT DISTINCT team_id FROM email_accounts')).map((r) => r.team_id);
  const each = (fn) => async () => {
    for (const team of await teams().catch(() => [])) await fn(appFor(team)).catch((e) => ctx.log.warn('email:', e.message));
  };

  return {
    handlers,
    async routes(req, res, url) {
      if (!url.pathname.startsWith('/hooks/email/act/')) return false;
      // The token itself says which team it belongs to only after a lookup, so try the teams we know.
      const token = decodeURIComponent(url.pathname.slice('/hooks/email/act/'.length));
      for (const team of await teams()) {
        const app = appFor(team);
        const seen = await app.rbe.peekLink(token);
        if (!seen.error || !/not one of ours/.test(seen.error)) { await handleSignedLink(req, res, app, token); return true; }
      }
      await handleSignedLink(req, res, appFor('none'), token);
      return true;
    },
    start() {
      const every = (s, fn) => { const t = setInterval(fn, s * 1000); t.unref?.(); timers.push(t); };
      every(Number(ctx.env('SYNC_SECONDS') || 60), each((app) => app.mb.sync()));
      every(Number(ctx.env('POLL_SECONDS') || 30), each((app) => app.rbe.poll()));
      every(60, each((app) => app.rbe.maybeSendDigest()));
    },
    stop() { for (const t of timers) clearInterval(t); timers = []; },
    async exportTeam(team) {
      const q = (table) => ctx.db.query(`SELECT * FROM ${table} WHERE team_id = ?`, [team.id]);
      const accounts = (await q('email_accounts')).map(({ auth, sync_state, ...a }) => a);
      const app = appFor(team.id);
      const messages = [];
      for (const m of await q('email_messages')) messages.push({ ...m, body: (await blobs.get(m.body_ref))?.text ?? null });
      return { accounts, threads: await q('email_threads'), messages, drafts: await q('email_drafts'), settings: await app.mb.settings(), members: await q('email_members'), commands: await q('email_commands'), alerts: await q('email_alerts') };
    },
  };
}
