// The hosted copy: sign-in with a warOnSaaS account (AUTH_PROVIDER=waronsaas) against a small fake of the
// account server. "Look freely, sign in to use": every page opens signed out, every action needs an account,
// a dead account session signs the person out here too, and AI apps connect through the account.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { makeHandler } from '../lib/http.mjs';
import { makeGetApp } from '../lib/hosted.mjs';
import { WosAccount, accountFor } from '../lib/account.mjs';

const CLIENT = { id: 'email', secret: 'test-secret' };
let fake, issuer, srv, base, account;
const live = new Map(); // sid -> still signed in?
const people = { sam: { sub: 'acc_sam', email: 'sam@acme.example', name: 'Sam Rivera', teams: [] }, casey: { sub: 'acc_casey', email: 'casey@birch-law.example', name: 'Casey Morgan', teams: [{ id: 'tm_birch', slug: 'birch', name: 'Birch Law', role: 'member' }] } };
let signInAs = 'sam';
let seen = [];

const b64u = (b) => Buffer.from(b).toString('base64url');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
const idToken = (claims) => {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const b = b64u(JSON.stringify(claims));
  return `${h}.${b}.${b64u(crypto.sign('RSA-SHA256', Buffer.from(`${h}.${b}`), privateKey))}`;
};

before(async () => {
  const codes = new Map();
  fake = http.createServer(async (rq, rs) => {
    const u = new URL(rq.url, 'http://x');
    const send = (o, st = 200) => rs.writeHead(st, { 'content-type': 'application/json' }).end(JSON.stringify(o));
    seen.push(`${rq.method} ${u.pathname}${u.search}`);
    if (u.pathname === '/jwks.json') return send({ keys: [jwk] });
    if (u.pathname === '/oauth/authorize') {
      const to = new URL(u.searchParams.get('redirect_uri'));
      to.searchParams.set('state', u.searchParams.get('state'));
      if (u.searchParams.get('prompt') === 'none') { to.searchParams.set('error', 'login_required'); return rs.writeHead(302, { location: to.toString() }).end(); }
      const code = crypto.randomUUID();
      codes.set(code, { nonce: u.searchParams.get('nonce'), who: signInAs, sid: `ses_${crypto.randomUUID().slice(0, 8)}` });
      to.searchParams.set('code', code);
      return rs.writeHead(302, { location: to.toString() }).end();
    }
    let body = '';
    for await (const c of rq) body += c;
    if (u.pathname === '/oauth/token') {
      const q = Object.fromEntries(new URLSearchParams(body));
      const c = codes.get(q.code);
      if (!c) return send({ error: 'invalid_grant' }, 400);
      codes.delete(q.code);
      live.set(c.sid, true);
      const p = people[c.who];
      const now = Math.floor(Date.now() / 1000);
      return send({ access_token: 'at', token_type: 'bearer', id_token: idToken({ iss: issuer, aud: CLIENT.id, sub: p.sub, sid: c.sid, email: p.email, email_verified: true, name: p.name, teams: p.teams, nonce: c.nonce, iat: now, exp: now + 300 }) });
    }
    if (u.pathname === '/api/sessions/check') {
      const { sid } = JSON.parse(body);
      return send({ sessions: { [sid]: live.get(sid) !== false } });
    }
    if (u.pathname === '/oauth/end-session') return rs.writeHead(302, { location: u.searchParams.get('post_logout_redirect_uri') }).end();
    rs.writeHead(404).end();
  });
  await new Promise((r) => fake.listen(0, r));
  issuer = `http://127.0.0.1:${fake.address().port}`;
  srv = http.createServer();
  await new Promise((r) => srv.listen(0, r));
  base = `http://localhost:${srv.address().port}`;
  const env = { AUTH_PROVIDER: 'waronsaas', WOS_ACCOUNT_CLIENT_ID: CLIENT.id, WOS_ACCOUNT_CLIENT_SECRET: CLIENT.secret, WOS_ACCOUNT_URL: issuer, PUBLIC_URL: base, WOS_DEMO: '1' };
  // The same client the handler would build from env (checked below), kept in hand so a test can drop its cache.
  account = accountFor(env);
  assert.ok(account instanceof WosAccount);
  assert.equal(account.issuer, issuer);
  srv.on('request', makeHandler(makeGetApp({ env, demo: true }), { demo: true, env, account }));
});
after(() => { srv?.closeAllConnections(); srv?.close(); fake?.closeAllConnections(); fake?.close(); });

const jar = () => {
  const c = new Map();
  return {
    set(res) { for (const s of res.headers.getSetCookie?.() ?? []) { const [kv] = s.split(';'); const [k, ...v] = kv.split('='); if (/Max-Age=0/.test(s)) c.delete(k); else c.set(k, v.join('=')); } },
    get header() { return [...c].map(([k, v]) => `${k}=${v}`).join('; '); },
    has: (k) => c.has(k),
  };
};
const get = async (path, cookies, headers = {}) => { const r = await fetch(path.startsWith('http') ? path : base + path, { redirect: 'manual', headers: { ...headers, ...(cookies ? { cookie: cookies.header } : {}) } }); cookies?.set(r); return r; };
const tool = (name, input = {}, cookies, headers = {}) => fetch(`${base}/api/tools/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'wos-email', ...headers, ...(cookies ? { cookie: cookies.header } : {}) }, body: JSON.stringify(input) });

// Walks the browser through /auth/waronsaas, the fake account and the callback. Returns the cookie jar.
async function signIn(next = '/', extra = '') {
  const c = jar();
  const start = await get(`/auth/waronsaas?next=${encodeURIComponent(next)}${extra}`, c);
  assert.equal(start.status, 302);
  const at = new URL(start.headers.get('location'));
  assert.equal(at.origin, issuer);
  assert.equal(at.searchParams.get('client_id'), CLIENT.id);
  assert.equal(at.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(c.has('wos_acct_flow'), 'the flow cookie is set');
  const back = await get(at.toString(), c);
  assert.equal(back.status, 302);
  const cb = await get(back.headers.get('location'), c);
  return { c, cb };
}

test('signed out, every page opens: the demo mailbox, the prompt script, no redirect', async () => {
  for (const p of ['/', '/inbox/all', '/search?q=invoice', '/drafts', '/approvals', '/by-email', '/settings']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    assert.match(html, /prompt\.js" defer data-signed-in="false" data-app="Email" data-signin="\/auth\/waronsaas"/, p);
    assert.match(html, /Looking at the demo/, p);
    assert.doesNotMatch(html, /Sign in to Email<\/h1>/, `${p} must not be a sign-in wall`);
  }
  const home = await (await get('/')).text();
  assert.match(home, /Lease renewal/, 'the demo inbox is on screen');
  assert.match(home, /href="\/auth\/waronsaas\?next=%2F"/);
});

test('an action without a session answers 401 sign_in, on REST and MCP', async () => {
  const r = await tool('email.archive', { thread_id: 't_x' });
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: { code: 'sign_in', message: 'Sign in to your warOnSaaS account' } });
  assert.match(r.headers.get('www-authenticate'), /resource_metadata/);
  const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(mcp.status, 401);
  assert.equal((await mcp.json()).error.code, 'sign_in');
  const login = await get('/login?next=/settings');
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/auth/waronsaas?next=%2Fsettings');
});

test('the callback signs a person in, in a space of their own, and an action works', async () => {
  signInAs = 'sam';
  const { c, cb } = await signIn('/settings');
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/settings');
  assert.ok(c.has('wos_email_session'));
  assert.ok(!c.has('wos_acct_flow'), 'the flow cookie is cleared');
  const page = await get('/settings', c);
  const html = await page.text();
  assert.match(html, /data-signed-in="true"/);
  assert.match(html, /Sam Rivera/);
  assert.match(html, /href="\/logout"/);
  assert.match(html, /Your own copy of the Acme Dental mailbox/, 'a space of their own, kept in memory');
  // Their account email matched the demo teammate once; the account id is now stored on that member.
  const members = await (await tool('email.list_members', {}, c)).json();
  const sam = members.result.members.find((m) => m.email === 'sam@acme.example');
  assert.ok(sam, JSON.stringify(members));
  assert.equal(members.result.members.filter((m) => m.email === 'sam@acme.example').length, 1, 'matched, not duplicated');
  const inbox = await (await tool('email.list_threads', { view: 'needs_you' }, c)).json();
  const lease = inbox.result.threads.find((t) => /Lease renewal/.test(t.subject));
  const arch = await tool('email.archive', { thread_id: lease.id }, c);
  assert.equal(arch.status, 200, await arch.text());
  // A second account gets a different space: the archive above did not touch it.
  signInAs = 'casey';
  const other = await signIn('/');
  const theirs = await (await tool('email.list_threads', { view: 'needs_you' }, other.c)).json();
  assert.ok(theirs.result.threads.some((t) => /Lease renewal/.test(t.subject)), 'each account has its own space');
  const team = await (await tool('email.list_members', {}, other.c)).json();
  const casey = team.result.members.find((m) => m.email === 'casey@birch-law.example');
  assert.equal(casey.role, 'member', 'role follows the warOnSaaS team');
  // Sign out: the app cookie goes, and the browser is sent to end the account session too.
  const out = await get('/logout', other.c);
  assert.equal(out.status, 302);
  const to = new URL(out.headers.get('location'));
  assert.equal(to.pathname, '/oauth/end-session');
  assert.equal(to.searchParams.get('post_logout_redirect_uri'), base);
  assert.ok(!other.c.has('wos_email_session'));
});

test('a silent try that finds no account session comes back signed out, page still open', async () => {
  const { c, cb } = await signIn('/approvals', '&prompt=none');
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/approvals');
  assert.ok(!c.has('wos_email_session'));
  assert.equal((await get('/approvals', c)).status, 200);
});

test('a dead account session ("sign out everywhere") signs the person out here too', async () => {
  signInAs = 'sam';
  const { c } = await signIn('/');
  assert.equal((await tool('email.list_members', {}, c)).status, 200);
  assert.ok(seen.some((s) => s.startsWith('POST /api/sessions/check')), 'the account was asked whether the session is live');
  const sid = [...live.keys()].at(-1);
  live.set(sid, false);
  account.live.clear(); // the answer is cached a minute; a minute passes
  const r = await tool('email.list_members', {}, c);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.code, 'sign_in');
  const page = await get('/', c);
  assert.equal(page.status, 200, 'the page still opens');
  assert.match(await page.text(), /data-signed-in="false"/);
});

test('an AI app connects through the account as a connection, and its token works over MCP', async () => {
  signInAs = 'sam';
  const reg = await (await fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude Code', redirect_uris: ['http://localhost:9/cb'] }) })).json();
  const verifier = b64u(crypto.randomBytes(32));
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  const c = jar();
  const auth = await get(`/oauth/authorize?client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent('http://localhost:9/cb')}&response_type=code&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`, c);
  assert.equal(auth.status, 302);
  const at = new URL(auth.headers.get('location'));
  assert.equal(at.origin, issuer);
  assert.equal(at.searchParams.get('connection'), 'Claude Code via Email');
  assert.match(at.searchParams.get('scope'), /offline_access/);
  const back = await get(at.toString(), c);
  const cb = await get(back.headers.get('location'), c);
  assert.equal(cb.status, 302);
  const to = new URL(cb.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'http://localhost:9/cb');
  assert.equal(to.searchParams.get('state'), 'xyz');
  const tok = await (await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: to.searchParams.get('code'), redirect_uri: 'http://localhost:9/cb', client_id: reg.client_id, code_verifier: verifier }) })).json();
  assert.ok(tok.access_token, JSON.stringify(tok));
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tok.access_token}` } } }));
  const r = await client.callTool({ name: 'email.list_members', arguments: {} });
  assert.ok(!r.isError, r.content?.[0]?.text);
  assert.ok(r.structuredContent.members.some((m) => m.email === 'sam@acme.example'));
  await client.close();
  // Refresh keeps the account session on the new token.
  const again = await (await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: reg.client_id }) })).json();
  assert.ok(again.access_token);
  const rest = await tool('email.list_members', {}, null, { authorization: `Bearer ${again.access_token}` });
  assert.equal(rest.status, 200);
});

// A back-channel logout token from the account, as its server mints it.
const logoutToken = (sub, { deleted = false } = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const events = { 'http://schemas.openid.net/event/backchannel-logout': {} };
  if (deleted) events['https://waronsaas.com/events/account-deleted'] = {};
  return idToken({ iss: issuer, aud: CLIENT.id, sub, jti: crypto.randomUUID(), events, iat: now, exp: now + 120 });
};

test('the back channel: "sign out everywhere" ends every session at once, a deletion removes the account\'s space', async () => {
  signInAs = 'casey';
  const { c } = await signIn('/');
  await new Promise((r) => setTimeout(r, 1100)); // the sign-out must come after the token's issue second
  assert.equal((await tool('email.list_members', {}, c)).status, 200);
  // An AI app's token for the same account.
  const reg = await (await fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Codex', redirect_uris: ['http://localhost:9/cb'] }) })).json();
  const verifier = b64u(crypto.randomBytes(32));
  const c2 = jar();
  const auth = await get(`/oauth/authorize?client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent('http://localhost:9/cb')}&response_type=code&state=s&code_challenge=${b64u(crypto.createHash('sha256').update(verifier).digest())}&code_challenge_method=S256`, c2);
  const cb = await get((await get(auth.headers.get('location'), c2)).headers.get('location'), c2);
  const tok = await (await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: new URL(cb.headers.get('location')).searchParams.get('code'), redirect_uri: 'http://localhost:9/cb', client_id: reg.client_id, code_verifier: verifier }) })).json();
  assert.equal((await tool('email.list_members', {}, null, { authorization: `Bearer ${tok.access_token}` })).status, 200);
  await new Promise((r) => setTimeout(r, 1100));

  // A bad token changes nothing and still gets 200.
  const bad = await fetch(`${base}/auth/waronsaas/backchannel`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ logout_token: 'nope' }) });
  assert.equal(bad.status, 200);
  assert.equal((await bad.json()).ok, false);
  assert.equal((await tool('email.list_members', {}, c)).status, 200);

  // Sign out everywhere: the cookie, the AI app's token and its refresh token all die at once.
  const out = await fetch(`${base}/auth/waronsaas/backchannel`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ logout_token: logoutToken(people.casey.sub) }) });
  assert.equal(out.status, 200);
  assert.deepEqual(await out.json(), { ok: true, deleted: false });
  assert.equal((await tool('email.list_members', {}, c)).status, 401);
  assert.equal((await tool('email.list_members', {}, null, { authorization: `Bearer ${tok.access_token}` })).status, 401);
  const refreshed = await (await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: reg.client_id }) })).json();
  assert.equal(refreshed.error, 'invalid_grant');
  assert.match(await (await get('/', c)).text(), /data-signed-in="false"/, 'the page still opens, signed out');
  // Signing in again works: a new token is newer than the sign-out.
  await new Promise((r) => setTimeout(r, 1100));
  const again = await signIn('/');
  assert.equal((await tool('email.list_members', {}, again.c)).status, 200);
  const spaceBefore = await (await tool('email.list_threads', { view: 'needs_you' }, again.c)).json();
  assert.ok(spaceBefore.result.threads.length > 0, 'the space is still there');

  // Deleted: the space goes too. Casey's space is a team space with Casey alone in it, so it goes.
  await new Promise((r) => setTimeout(r, 1100));
  const del = await fetch(`${base}/auth/waronsaas/backchannel`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ logout_token: logoutToken(people.casey.sub, { deleted: true }) }) });
  assert.deepEqual(await del.json(), { ok: true, deleted: true });
  assert.equal((await tool('email.list_members', {}, again.c)).status, 401);
});

test('with a database, a space is durable: an archive survives a server restart, the signed-out demo never reaches it', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wos-email-space-')), 'spaces.sqlite');
  const env = { AUTH_PROVIDER: 'waronsaas', WOS_ACCOUNT_CLIENT_ID: CLIENT.id, WOS_ACCOUNT_CLIENT_SECRET: CLIENT.secret, WOS_ACCOUNT_URL: issuer, WOS_DEMO: '1', SQLITE_FILE: file };
  const claims = { sub: 'acc_riley', sid: 'ses_r1', sp: 'acct:acc_riley', n: 'Riley Chen', e: 'riley@elsewhere.example', ev: true, r: 'owner' };
  const { personForClaims } = await import('../lib/account.mjs');
  const run = async (fn) => {
    const getApp = makeGetApp({ env, demo: true });
    assert.equal(getApp.memoryOnly, false);
    const out = await fn(getApp);
    const a = await getApp('acct:acc_riley');
    await a.db.close();
    return out;
  };
  // The process may carry a DATABASE_URL (it does on Vercel): the signed-out demo must still stay in memory.
  const hadUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://nobody:nothing@127.0.0.1:1/never';
  const archivedId = await run(async (getApp) => {
    const demo = await getApp(null);
    assert.equal(demo.db.kind, 'sqlite');
    assert.notEqual(demo.db, (await getApp('acct:acc_riley')).db, 'the signed-out demo has storage of its own, in memory');
    assert.equal((await demo.db.get("SELECT COUNT(*) AS n FROM email_members WHERE email = 'sam@acme.example'")).n, 1);
    assert.equal(fs.existsSync(file) && (await (await getApp('acct:acc_riley')).db.get("SELECT COUNT(*) AS n FROM email_members WHERE email = 'sam@acme.example'")).n, 1, 'the space has its own starter copy; the demo did not land in the file');
    const space = await getApp('acct:acc_riley');
    const me = await personForClaims(space.mb, claims, null);
    assert.equal(me.role, 'owner');
    const list = await space.callTool('email.list_threads', { view: 'needs_you' }, { actor: { kind: 'person', channel: 'web', name: me.name }, person: me });
    const lease = list.result.threads.find((t) => /Lease renewal/.test(t.subject));
    assert.ok(lease, 'the space starts with the starter mailbox');
    const read = await space.callTool('email.read_thread', { thread_id: lease.id }, { actor: { kind: 'person', channel: 'web', name: me.name }, person: me });
    assert.match(read.result.messages[0].body?.text ?? read.result.messages[0].text ?? '', /landlord/, 'bodies live in the database too');
    const arch = await space.callTool('email.archive', { thread_id: lease.id }, { actor: { kind: 'person', channel: 'web', name: me.name }, person: me });
    assert.ok(arch.ok, arch.error);
    return lease.id;
  });
  // A new server: a fresh getApp over the same file.
  await run(async (getApp) => {
    const space = await getApp('acct:acc_riley');
    const members = await space.mb.members();
    assert.equal(members.filter((m) => m.sub === 'acc_riley').length, 1, 'the member is still there, not made twice');
    const me = await personForClaims(space.mb, claims, null);
    const list = await space.callTool('email.list_threads', { view: 'needs_you' }, { actor: { kind: 'person', channel: 'web', name: me.name }, person: me });
    assert.ok(!list.result.threads.some((t) => t.id === archivedId), 'the archive persisted');
    const archived = await space.callTool('email.list_threads', { view: 'archived' }, { actor: { kind: 'person', channel: 'web', name: me.name }, person: me });
    assert.ok(archived.result.threads.some((t) => t.id === archivedId));
    const demoRows = await space.db.get("SELECT COUNT(*) AS n FROM email_members WHERE email = 'sam@acme.example'");
    assert.equal(Number(demoRows.n), 1, 'only the space\'s own starter copy is in the database, not the signed-out demo');
    // Mail delivered after the restart still arrives: ids on the fresh fake server are above the stored ones.
    await space.mb.memory.transport('jordan@acme.example').send({ from: { name: 'Jordan Lee', address: 'jordan@acme.example' }, to: 'sam@acme.example', subject: 'After the restart', text: 'Still here?' });
    await space.mb.sync();
    const again = await space.callTool('email.search', { q: 'restart' }, { actor: { kind: 'person', channel: 'web', name: me.name }, person: me });
    assert.equal(again.result.threads.length, 1, 'new mail after a restart is picked up');
    // The account is deleted: its space leaves the database.
    const gone = await getApp.removeAccount('acc_riley');
    assert.deepEqual(gone, ['acct:acc_riley']);
    assert.equal((await space.db.get('SELECT COUNT(*) AS n FROM email_threads WHERE team_id = ?', ['acct:acc_riley'])).n, 0);
    assert.equal((await space.db.get('SELECT COUNT(*) AS n FROM email_blobs')).n, 0, 'its message bodies go too');
    await getApp.signouts.mark('acc_riley', { deleted: true });
    assert.equal((await space.db.get('SELECT deleted FROM email_signouts WHERE sub = ?', ['acc_riley'])).deleted, 1);
  });
  if (hadUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = hadUrl;
});
