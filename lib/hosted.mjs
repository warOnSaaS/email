// Which EmailApp a request works in. One app per install when people sign in with GitHub or the email
// link (today's self-hosted model). With the warOnSaaS account every signed-in account gets a space of its
// own (or its team's), scoped by team_id in the install's database (DATABASE_URL, or the SQLite file) like
// the suite does. A new space starts as a copy of the Acme Dental starter mailbox to try things on, with
// its mail kept in the database and the fake mail server it talks to in memory. Without any database (the
// demo with WOS_DEMO and nothing else) a space is a demo copy kept in memory, so it starts again on a new
// server. Signed-out visitors always look at a shared demo mailbox that lives in memory only: it is never
// written to the database.
import { EmailApp, createEmailApp } from './app.mjs';
import { openDb } from './db.mjs';
import { openBlobs, dbBlobs } from './blobs.mjs';
import { seedDemo, seedDemoData, demoMailServer } from './demo.mjs';
import { authProvider } from './account-client.mjs';
import { Signouts } from './signouts.mjs';

// Every table with rows of a space.
const SPACE_TABLES = ['email_members', 'email_settings', 'email_accounts', 'email_threads', 'email_messages', 'email_drafts', 'email_approvals', 'email_commands', 'email_tokens', 'email_alerts', 'email_audit'];

const MAX_SPACES = 40;

export function makeGetApp({ env = process.env, demo = !!env.WOS_DEMO } = {}) {
  const hosted = authProvider(env) === 'waronsaas';
  // Durable spaces need a database of their own: Postgres, or an explicit SQLite file.
  const durable = !!(env.DATABASE_URL || (env.SQLITE_FILE && env.SQLITE_FILE !== ':memory:'));
  let shared, demoApp, db, blobs;
  const spaces = new Map();
  // The demo lives in memory, whatever the install's storage. Empty strings, not missing keys: a missing
  // key would let openDb and openBlobs fall back to process.env, and the demo would land in the database.
  const demoEnv = () => ({ ...env, WOS_DEMO: '1', DATABASE_URL: '', FILES_DIR: '', SQLITE_FILE: ':memory:' });
  // A space's copy shares the demo mailbox with everyone in the space (mailboxes are personal otherwise).
  const share = (app) => app.db.run("UPDATE email_accounts SET owner_id = NULL WHERE team_id = ? AND purpose = 'mailbox'", [app.mb.team]);
  const demoCopy = async ({ shared: sh = false } = {}) => {
    const { app } = await seedDemo({ env: demoEnv() });
    if (sh) await share(app);
    return app;
  };

  // Explicit values: openDb would fill a missing one from process.env.
  const getDb = async () => (db ??= await openDb({ url: env.DATABASE_URL || '', file: env.SQLITE_FILE || ':memory:' }));

  async function durableSpace(space) {
    await getDb();
    blobs ??= env.FILES_DIR ? openBlobs(env.FILES_DIR) : dbBlobs(db);
    // The fake mail server is new on every server start; its ids start above anything stored, so mail it
    // delivers from now on is always newer than what the space has seen.
    const memory = demoMailServer();
    memory.uid = Date.now();
    const app = new EmailApp({ db, blobs, env, team: space, memory, publicUrl: env.PUBLIC_URL });
    const members = await app.mb.members();
    if (!members.length) { await seedDemoData(app, memory); await share(app); return app; }
    // A space seen before: give the fake server the inboxes it had, so mail between teammates lands again.
    for (const m of members) memory.box(m.email);
    for (const a of await app.mb.accounts()) if (a.kind === 'memory') memory.box(a.address);
    return app;
  }

  async function spaceApp(space) {
    if (spaces.has(space)) { const a = spaces.get(space); spaces.delete(space); spaces.set(space, a); return a; }
    const made = durable ? durableSpace(space) : demoCopy({ shared: true });
    spaces.set(space, made);
    if (spaces.size > MAX_SPACES) spaces.delete(spaces.keys().next().value);
    return made;
  }

  // getApp(space): space is null for a signed-out visitor (and for every request on a self-hosted install).
  const getApp = async (space = null) => {
    if (!hosted) return (shared ??= demo ? demoCopy() : createEmailApp({ env }));
    if (!space) return (demoApp ??= demoCopy());
    return spaceApp(space);
  };
  getApp.hosted = hosted;
  // Sign-outs heard from the account: in the database when spaces are durable, else on this server only.
  getApp.signouts = hosted ? new Signouts(durable ? getDb : async () => null) : null;
  // An account was deleted: its own space goes, and it leaves every team space; a team space with nobody
  // left goes too.
  getApp.removeAccount = async (sub) => {
    const own = `acct:${sub}`;
    const gone = new Set([own]);
    const drop = async (d, team) => {
      await d.run('DELETE FROM email_blobs WHERE key IN (SELECT body_ref FROM email_messages WHERE team_id = ?)', [team]).catch(() => {});
      for (const t of SPACE_TABLES) await d.run(`DELETE FROM ${t} WHERE team_id = ?`, [team]);
    };
    if (durable) {
      const d = await getDb();
      const teams = (await d.all('SELECT DISTINCT team_id FROM email_members WHERE sub = ?', [sub])).map((r) => r.team_id);
      for (const team of teams) {
        if (team === own) continue;
        await d.run('DELETE FROM email_members WHERE team_id = ? AND sub = ?', [team, sub]);
        if (!(await d.get('SELECT 1 AS x FROM email_members WHERE team_id = ?', [team]))) gone.add(team);
      }
      for (const team of gone) await drop(d, team);
    } else {
      for (const [team, made] of spaces) {
        if (team === own) continue;
        const app = await made;
        await app.db.run('DELETE FROM email_members WHERE team_id = ? AND sub = ?', [app.mb.team, sub]);
        if (!(await app.mb.members()).length) gone.add(team);
      }
    }
    for (const team of gone) spaces.delete(team);
    return [...gone];
  };
  // A space kept in memory only is a demo copy that resets; the screens say so.
  getApp.memoryOnly = hosted && !durable;
  return getApp;
}
