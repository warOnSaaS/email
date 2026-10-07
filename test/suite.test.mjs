// The parts the suite loads: server.mjs register(ctx) with one handler per tool, and dist/screens.mjs
// mounted in a browser with a fake suite context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import register from '../server.mjs';
import { TOOLS } from '../lib/tools.mjs';
import { openDb } from '../lib/db.mjs';
import { makeHandler } from '../lib/http.mjs';
import { demo } from './helpers.mjs';

async function fakeCtx() {
  const db = await openDb({ file: ':memory:' });
  const events = [];
  return {
    events,
    ctx: {
      app: JSON.parse(fs.readFileSync('wos-app.json', 'utf8')),
      db: { dialect: 'sqlite', query: (s, p) => db.all(s, p), get: (s, p) => db.get(s, p), run: (s, p) => db.run(s, p), tx: (fn) => fn() },
      events: { publish: (team, name, data) => events.push({ team, name, data }), on: () => () => {} },
      alerts: { raise: async () => ({ id: 'al_1' }) },
      env: () => undefined,
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wos-email-')),
      publicUrl: 'https://suite.test',
      log: { info() {}, warn() {}, error() {} },
    },
  };
}
const callFor = (team, actor = { kind: 'person', id: 'p_sam', name: 'Sam Rivera' }, scopes = ['read', 'write', 'delete', 'admin']) => ({
  actor, team: { id: team, slug: team, name: team }, scopes, via: 'screen', callTool: async () => { throw Object.assign(new Error('no_tool'), { code: 'no_tool' }); }, emit() {},
});

test('register(ctx) has a handler for every tool, keeps teams apart, and exports a team', async () => {
  const { ctx } = await fakeCtx();
  const server = await register(ctx);
  assert.deepEqual(Object.keys(server.handlers).sort(), TOOLS.map((t) => t.name).sort());
  const acme = callFor('acme'), birch = callFor('birch');
  await server.handlers['email.add_member']({ name: 'Sam Rivera', email: 'sam@acme.example' }, acme);
  await server.handlers['email.set_rules']({ rules: [{ from: '*@news.example', triage: 'news' }] }, acme);
  assert.equal((await server.handlers['email.get_settings']({}, acme)).rules.length, 1);
  assert.equal((await server.handlers['email.get_settings']({}, birch)).rules.length, 0, 'another team sees its own settings');
  assert.equal((await server.handlers['email.list_members']({}, birch)).members.length, 0);
  // Admin tools follow the suite's scopes.
  await assert.rejects(server.handlers['email.update_settings']({ digest_hour: 9 }, callFor('acme', undefined, ['read', 'write'])), /owner or admin/);
  const out = await server.handlers['email.list_threads']({ view: 'all' }, acme);
  assert.match(out.summary, /No mailbox/);
  const exp = await server.exportTeam({ id: 'acme' });
  assert.equal(exp.members.length, 1);
  assert.ok(!JSON.stringify(exp).includes('"auth"'));
  server.stop?.();
});

test('the screen part mounts, draws from tool results, and every control names a tool', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser here'); }
  const { app } = await demo();
  const srv = http.createServer(makeHandler(async () => app, { demo: true }));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/health`);
    await page.setContent(`<!doctype html><html data-scheme="ops" data-mode="dark"><head><link rel="stylesheet" href="${base}/ui/src/ui.css"><link rel="stylesheet" href="${base}/ui/src/tokens.css"></head><body><main id="app"></main></body></html>`);
    const bundle = fs.readFileSync('dist/screens.mjs', 'utf8');
    await page.evaluate(async ({ bundle }) => {
      const url = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));
      const mod = (await import(url)).default;
      window.calls = [];
      window.toasts = [];
      window.nav = [];
      const ctx = {
        path: '/',
        me: { id: 'p_sam', name: 'Sam Rivera', email: 'sam@acme.example' },
        team: { id: 'default', slug: 'acme', name: 'Acme Dental' },
        callTool: async (name, input) => {
          window.calls.push(name);
          const r = await fetch(`/api/tools/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wos': '1' }, body: JSON.stringify(input ?? {}) });
          const b = await r.json();
          if (b.error) throw new Error(b.error.message);
          return b.result ?? b;
        },
        on: () => () => {},
        navigate: (p) => window.nav.push(p),
        toast: (m) => window.toasts.push(m),
      };
      window.mounted = mod.mount(document.getElementById('app'), ctx);
    }, { bundle });
    await page.waitForSelector('.ui-inbox-i');
    assert.match(await page.textContent('h1'), /Needs you/);
    const loose = await page.evaluate(() => [...document.querySelectorAll('#app button, #app form')].filter((el) => !el.dataset.tool || (el.dataset.tool === 'none' && !el.dataset.why)).map((el) => el.outerHTML.slice(0, 100)));
    assert.deepEqual(loose, []);
    await page.click('.ui-inbox-i .row-main');
    await page.waitForSelector('[data-thread-page]');
    assert.ok((await page.evaluate(() => window.nav)).some((p) => p.startsWith('/t/')));
    await page.keyboard.press('e');
    await page.waitForSelector('.ui-inbox-i');
    const calls = await page.evaluate(() => window.calls);
    assert.ok(calls.includes('email.read_thread') && calls.includes('email.archive'), calls.join(','));
    await page.evaluate(() => window.mounted.unmount());
    assert.equal(await page.evaluate(() => document.getElementById('app').innerHTML), '');
  } finally {
    await browser.close();
    srv.closeAllConnections(); srv.close();
  }
});

test('dist/screens.mjs is built from the current code', async () => {
  const { build } = await import('esbuild');
  const { screensOptions } = await import('../scripts/build-screens.mjs');
  const out = await build({ ...screensOptions, write: false });
  assert.equal(fs.readFileSync('dist/screens.mjs', 'utf8'), out.outputFiles[0].text, 'run npm run build:screens');
});
