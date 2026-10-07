// Agent parity (ROADMAP 3.2): every action on a screen names a tool in the catalogue, every tool is
// reachable over MCP and REST from the same handler, and screens send nothing except tool calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { TOOLS, catalogue } from '../lib/tools.mjs';
import { KEYS } from '../lib/pages.mjs';
import { makeHandler } from '../lib/http.mjs';
import { demo } from './helpers.mjs';

const NAMES = new Set(TOOLS.map((t) => t.name));
let srv, base, app;

before(async () => {
  ({ app } = await demo());
  srv = http.createServer(makeHandler(async () => app, { demo: true }));
  await new Promise((r) => srv.listen(0, r));
  base = `http://localhost:${srv.address().port}`;
});
after(() => { srv?.closeAllConnections(); srv?.close(); });

async function screens() {
  const thread = (await app.mb.listThreads({ view: 'all' }))[0].id;
  const paths = ['/', '/inbox/fyi', '/inbox/news', '/inbox/all', '/inbox/snoozed', '/inbox/archived', '/search?q=invoice', `/t/${thread}`, '/drafts', '/approvals', '/by-email', '/settings'];
  return Promise.all(paths.map(async (p) => [p, await (await fetch(base + p)).text()]));
}

test('the catalogue: every tool has a name, description, schema, scope and confirm', async () => {
  for (const t of TOOLS) {
    assert.match(t.name, /^email\.[a-z]+(_[a-z]+)*$/, t.name);
    assert.ok(t.description?.length > 20, `${t.name} needs a plain description`);
    assert.ok(t.title, `${t.name} needs a title`);
    assert.ok(['read', 'write', 'delete', 'admin'].includes(t.scope), `${t.name} scope`);
    assert.ok(['none', 'human'].includes(t.confirm), `${t.name} confirm`);
    assert.equal(typeof t.input, 'object');
  }
  // ROADMAP 5.4, section 4: the tools the plan names all exist.
  for (const n of ['email.search', 'email.read_thread', 'email.draft', 'email.send', 'email.archive', 'email.label', 'email.snooze', 'email.triage', 'email.connect_account', 'email.set_rules']) assert.ok(NAMES.has(n), n);
  assert.equal(TOOLS.find((t) => t.name === 'email.send').confirm, 'human');
  assert.equal(TOOLS.find((t) => t.name === 'email.delete_thread').confirm, 'human');
});

test('every tool names a test, and that test calls it', async () => {
  for (const t of TOOLS) {
    assert.ok(t.test && fs.existsSync(t.test), `${t.name}: test file ${t.test}`);
    assert.ok(fs.readFileSync(t.test, 'utf8').includes(`'${t.name}'`), `${t.test} never calls ${t.name}`);
  }
});

test('tools.json and wos-app.json match the code', async () => {
  assert.equal(fs.readFileSync('tools.json', 'utf8'), `${JSON.stringify(await catalogue(), null, 2)}\n`, 'run npm run tools:json');
  const m = JSON.parse(fs.readFileSync('wos-app.json', 'utf8'));
  for (const k of ['id', 'version', 'requires', 'tools', 'tables', 'server', 'screens', 'needs', 'data']) assert.ok(m[k], `manifest needs ${k}`);
  assert.equal(m.version, JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
});

test('every button and form on every screen names a tool, or says why not (data-tool="none" data-why)', async () => {
  const missing = [];
  const unknown = [];
  let actions = 0;
  for (const [p, html] of await screens()) {
    for (const tag of html.match(/<(button|form)\b[^>]*>/g) ?? []) {
      actions++;
      const tool = /data-tool="([^"]+)"/.exec(tag)?.[1];
      if (tool === 'none') { if (!/data-why="[^"]{8,}"/.test(tag)) missing.push(`${p}: data-tool="none" without data-why: ${tag.slice(0, 120)}`); continue; }
      if (tool) { if (!NAMES.has(tool)) unknown.push(`${p}: ${tool}`); continue; }
      missing.push(`${p}: ${tag.slice(0, 120)}`);
    }
  }
  assert.deepEqual(unknown, [], 'screens name tools that do not exist');
  assert.deepEqual(missing, [], 'screen actions without a tool');
  assert.ok(actions > 60, `expected many actions, found ${actions}`);
});

test('every keyboard shortcut runs a tool or only moves around', () => {
  for (const [key, label, what] of KEYS) {
    assert.ok(label, key);
    if (what.startsWith('ui:') || what.startsWith('nav:')) continue;
    assert.ok(NAMES.has(what), `${key} names ${what}, which is not a tool`);
  }
  const client = fs.readFileSync('public/app/wire.mjs', 'utf8');
  for (const [key] of KEYS) {
    const k = key.split(' ').pop().replace('Mod+', '').replace('Shift+', '');
    assert.ok(client.includes(`${JSON.stringify(k).slice(1, -1)}`), `the browser handles ${key}`);
  }
});

test('no side doors: screen code only calls /api/tools', () => {
  for (const f of fs.readdirSync('public/app').filter((x) => x.endsWith('.mjs'))) {
    const src = fs.readFileSync(`public/app/${f}`, 'utf8');
    const calls = [...src.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
    for (const c of calls) assert.match(c, /^`\/api\/tools\//, `${f} fetches ${c}`);
    assert.ok(!/XMLHttpRequest|sendBeacon|new WebSocket/.test(src), `${f} has another way out`);
  }
});

test('every tool is reachable over MCP, and MCP and REST give the same answer', async () => {
  const client = new Client({ name: 'parity-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...NAMES].sort());
  const viaMcp = await client.callTool({ name: 'email.search', arguments: { q: 'lease' } });
  const viaRest = await (await fetch(`${base}/api/tools/email.search`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer demo' }, body: JSON.stringify({ q: 'lease' }) })).json();
  assert.deepEqual(viaMcp.structuredContent, viaRest.result);
  assert.equal(viaMcp.content[0].text, JSON.stringify(viaRest.result));
  await client.close();
});

test('an agent, using only MCP, does a day\'s email', async () => {
  const client = new Client({ name: 'agent-run', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, `${name}: ${r.content[0].text}`);
    return r.structuredContent;
  };
  const inbox = await call('email.list_threads', { view: 'needs_you' });
  const id = inbox.threads.find((t) => /Crown case/.test(t.subject)).id;
  assert.match((await call('email.read_thread', { thread_id: id })).summary, /untrusted, from outside/);
  const draft = await call('email.draft', { thread_id: id, ai: true, instructions: 'use shade A2' });
  const sent = await call('email.send', { draft_id: draft.id });
  assert.ok(sent.pending?.approval_id, 'an outside send waits for a person');
  await call('email.label', { thread_id: id, add: ['lab'] });
  await call('email.archive', { thread_id: id });
  await call('email.set_rules', { rules: [{ from: '*@smallbiz-weekly.example', triage: 'news' }] });
  assert.match((await call('email.list_approvals')).summary, /send "Re: Crown case/);
  assert.match((await call('email.export')).summary, /threads exported/);
  await client.close();
});

test('the browser makes no request that is not a tool call', async (t) => {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser here'); }
  const page = await browser.newPage();
  const seen = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === base && !/^\/(ui|app)\//.test(u.pathname) && r.resourceType() !== 'document') seen.push(`${r.method()} ${u.pathname}`); });
  await page.goto(`${base}/`);
  await page.keyboard.press('j');
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  await page.keyboard.press('s');
  await page.waitForLoadState('networkidle');
  // Every button in the open dialogs too (compose, keys, label), as the screen shows them.
  await page.keyboard.press('c');
  const loose = await page.evaluate(() => [...document.querySelectorAll('button, form, a[data-tool]')].filter((el) => !el.dataset.tool || (el.dataset.tool === 'none' && !el.dataset.why)).map((el) => el.outerHTML.slice(0, 100)));
  await browser.close();
  assert.deepEqual(loose, []);
  assert.ok(seen.length >= 2, `saw ${seen.join(', ')}`);
  for (const s of seen) assert.match(s, /^POST \/api\/tools\/email\.[a-z_]+$/);
});
