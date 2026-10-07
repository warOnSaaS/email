// Sign-in on a real (not demo) install: the email link, the session cookie, and who may call tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createEmailApp } from '../lib/app.mjs';
import { MemoryMailServer } from '../lib/mail/memory.mjs';
import { parseRaw } from '../lib/mail/parse.mjs';
import { makeHandler } from '../lib/http.mjs';
import { issueTokens } from '../lib/auth.mjs';

async function setup() {
  const memory = new MemoryMailServer({ signedDomains: ['acme.example'] });
  const app = await createEmailApp({ env: { SQLITE_FILE: ':memory:', FILES_DIR: '', TEAM_MEMBERS: 'Sam Rivera <sam@acme.example> owner, Jordan Lee <jordan@acme.example>' }, memory });
  memory.box('sam@acme.example');
  await app.mb.connectAccount({ kind: 'memory', address: 'ops@acme.example', purpose: 'commands' });
  const srv = http.createServer(makeHandler(async () => app, { demo: false, env: {} }));
  await new Promise((r) => srv.listen(0, r));
  return { app, memory, srv, base: `http://localhost:${srv.address().port}` };
}

test('the email link signs a teammate in once, and only after a button press', async () => {
  const { memory, srv, base } = await setup();
  try {
    assert.match(await (await fetch(`${base}/`)).text(), /Sign in to Email/);
    await fetch(`${base}/login/email`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=sam@acme.example&next=/settings' });
    const stranger = await fetch(`${base}/login/email`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=nobody@elsewhere.example' });
    assert.match(await stranger.text(), /Check your email/, 'same answer for strangers');
    const mail = await parseRaw(memory.box('sam@acme.example').INBOX.at(-1).raw);
    const url = /(http\S+login\/email\/open\S+)/.exec(mail.text)[1].replace(/^https?:\/\/[^/]+/, base);
    const look = await fetch(url);
    assert.equal(look.headers.get('set-cookie'), null);
    const t = new URL(url).searchParams.get('t');
    const go = await fetch(`${base}/login/email/open`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(t)}&next=/settings` });
    assert.equal(go.status, 303);
    assert.equal(go.headers.get('location'), '/settings');
    const cookie = go.headers.get('set-cookie').split(';')[0];
    const page = await fetch(`${base}/settings`, { headers: { cookie } });
    assert.match(await page.text(), /<h1>Settings/);
    const again = await fetch(`${base}/login/email/open`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(t)}` });
    assert.equal(again.status, 400);

    // Tools: a cookie alone (a forged cross-site post) is refused; our header plus the cookie is a person.
    const noHeader = await fetch(`${base}/api/tools/email.list_members`, { method: 'POST', headers: { cookie } });
    assert.equal(noHeader.status, 403);
    const ok = await fetch(`${base}/api/tools/email.list_members`, { method: 'POST', headers: { cookie, 'x-requested-with': 'wos-email', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(ok.status, 200);
    const anon = await fetch(`${base}/api/tools/email.list_members`, { method: 'POST', headers: { 'x-requested-with': 'wos-email' } });
    assert.equal(anon.status, 401);
    const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(mcp.status, 401);
    assert.match(mcp.headers.get('www-authenticate'), /resource_metadata/);
  } finally { srv.closeAllConnections(); srv.close(); }
});

test('a bearer token is an agent: it can draft but an outside send waits for a person', async () => {
  const { app, srv, base } = await setup();
  try {
    const sam = await app.mb.memberByEmail('sam@acme.example');
    const { access_token } = issueTokens(sam);
    const auth = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };
    await app.mb.connectAccount({ kind: 'memory', address: 'sam@acme.example', owner_id: sam.id });
    const sendRes = await fetch(`${base}/api/tools/email.send`, { method: 'POST', headers: auth, body: JSON.stringify({ to: 'dana@birch-law.example', subject: 'Hi', body: 'Hello' }) });
    assert.equal(sendRes.status, 202);
    const r = await sendRes.json();
    assert.ok(r.pending?.approval_id, JSON.stringify(r));
    const selfRes = await fetch(`${base}/api/tools/email.decide_approval`, { method: 'POST', headers: auth, body: JSON.stringify({ approval_id: r.pending.approval_id, decision: 'approve' }) });
    assert.equal(selfRes.status, 403);
    assert.equal((await selfRes.json()).error.code, 'scope');
  } finally { srv.closeAllConnections(); srv.close(); }
});
