// Which EmailApp a request works in. One app per install when people sign in with GitHub or the email
// link (today's self-hosted model). With the warOnSaaS account every signed-in account gets a space of its
// own (or its team's): rows in Postgres under DATABASE_URL, scoped by team_id like the suite does. Without a
// database (the hosted demo on Vercel) a space is a fresh copy of the demo mailbox kept in memory, so it
// starts again on a new server. Signed-out visitors always look at the shared demo mailbox.
import { EmailApp, createEmailApp } from './app.mjs';
import { openDb } from './db.mjs';
import { openBlobs } from './blobs.mjs';
import { seedDemo } from './demo.mjs';
import { authProvider } from './account-client.mjs';

const MAX_MEMORY_SPACES = 40;

export function makeGetApp({ env = process.env, demo = !!env.WOS_DEMO } = {}) {
  const hosted = authProvider(env) === 'waronsaas';
  let shared, demoApp, db, blobs;
  const spaces = new Map();
  // A space's copy shares the demo mailbox with everyone in the space (mailboxes are personal otherwise).
  const demoCopy = async ({ shared = false } = {}) => {
    const { app } = await seedDemo({ env: { ...env, WOS_DEMO: '1' } });
    if (shared) await app.db.run("UPDATE email_accounts SET owner_id = NULL WHERE team_id = ? AND purpose = 'mailbox'", [app.mb.team]);
    return app;
  };

  async function spaceApp(space) {
    if (spaces.has(space)) { const a = spaces.get(space); spaces.delete(space); spaces.set(space, a); return a; }
    let made;
    if (env.DATABASE_URL) {
      db ??= await openDb({ url: env.DATABASE_URL });
      blobs ??= openBlobs(env.FILES_DIR || undefined);
      made = Promise.resolve(new EmailApp({ db, blobs, env, team: space, publicUrl: env.PUBLIC_URL }));
    } else {
      made = demoCopy({ shared: true });
    }
    spaces.set(space, made);
    if (spaces.size > MAX_MEMORY_SPACES) spaces.delete(spaces.keys().next().value);
    return made;
  }

  // getApp(space): space is null for a signed-out visitor (and for every request on a self-hosted install).
  const getApp = async (space = null) => {
    if (!hosted) return (shared ??= demo ? demoCopy() : createEmailApp({ env }));
    if (!space) return (demoApp ??= demoCopy());
    return spaceApp(space);
  };
  getApp.hosted = hosted;
  // A space kept in memory is a demo copy; the screens say so.
  getApp.memoryOnly = hosted && !env.DATABASE_URL;
  return getApp;
}
