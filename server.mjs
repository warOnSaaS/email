// The long-running server: the web app, /mcp and /api/tools, plus the timers that keep mail flowing.
//   npm start                 uses DATABASE_URL (Postgres) or ./data/email.sqlite
//   npm run dev               the demo: a fictional mailbox on the in-memory mail server
//   PORT=3990                 the port (default 3990)
// Timers: new mail every SYNC_SECONDS (60), the command address every POLL_SECONDS (30), and the daily
// digest checked every minute.
import http from 'node:http';
import { makeHandler } from './lib/http.mjs';
import { createEmailApp } from './lib/app.mjs';
import { seedDemo } from './lib/demo.mjs';

export async function start({ demo = process.argv.includes('--demo') || !!process.env.WOS_DEMO, port = Number(process.env.PORT || 3990), timers = true } = {}) {
  const app = demo ? (await seedDemo()).app : await createEmailApp();
  const srv = http.createServer(makeHandler(async () => app, { demo }));
  await new Promise((r) => srv.listen(port, r));
  const every = (s, fn) => { const t = setInterval(() => fn().catch((e) => console.error(e.message)), s * 1000); t.unref(); return t; };
  if (timers) {
    every(Number(process.env.SYNC_SECONDS || 60), () => app.mb.sync());
    every(Number(process.env.POLL_SECONDS || 30), () => app.rbe.poll());
    every(60, () => app.rbe.maybeSendDigest());
  }
  return { srv, app, url: `http://localhost:${srv.address().port}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await start();
  console.log(`wOS Email on ${url}  (agents connect to ${url}/mcp)`);
}
