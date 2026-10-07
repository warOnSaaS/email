import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { dkimSign } from 'mailauth/lib/dkim/sign.js';
import { demo, web, sam, DEMO, fakeDns } from './helpers.mjs';
import { buildRaw } from '../lib/mail/compose.mjs';
import { parseRaw } from '../lib/mail/parse.mjs';
import { verifySender, ipOf } from '../lib/runbyemail/verify.mjs';
import { parseAnswer } from '../lib/runbyemail/index.mjs';
import { findReplyTokens } from '../lib/runbyemail/tokens.mjs';
import { makeHandler } from '../lib/http.mjs';

// What landed in someone's demo inbox, parsed, newest last.
const inbox = async (memory, who) => Promise.all(memory.box(who).INBOX.map((m) => parseRaw(m.raw)));
const sendAs = (memory, from, msg) => memory.transport(from).send({ from, to: DEMO.commands, ...msg });

test('a verified teammate\'s command is done and answered in the same thread', async () => {
  const { app, memory } = await demo();
  const before = (await inbox(memory, 'casey@acme.example')).length;
  const { messageId } = await sendAs(memory, 'casey@acme.example', { subject: 'search lease', text: 'search lease' });
  const out = await app.rbe.poll();
  assert.equal(out.handled, 1);
  assert.equal(out.results[0].accepted, 1, out.results[0].reason);
  const got = await inbox(memory, 'casey@acme.example');
  assert.equal(got.length, before + 1);
  const reply = got.at(-1);
  assert.equal(reply.inReplyTo, messageId);
  assert.match(reply.subject, /^Re: search lease/);
  assert.match(reply.text, /No mailbox connected yet|Nothing matches|found/);
});

test('mail from outside the team is logged and never answered', async () => {
  const { app, memory } = await demo();
  memory.box('stranger@elsewhere.example');
  await sendAs(memory, 'stranger@elsewhere.example', { subject: 'inbox', text: 'inbox' });
  const out = await app.rbe.poll();
  assert.equal(out.results[0].accepted, 0);
  assert.match(out.results[0].reason, /not a team member/);
  assert.equal((await inbox(memory, 'stranger@elsewhere.example')).length, 0);
});

test('a forged teammate address fails the checks and nothing is done', async () => {
  const { app, memory } = await demo();
  const { raw } = await buildRaw({ from: DEMO.me, to: DEMO.commands, subject: 'x', text: 'send d_aaaaaaaaaa' });
  memory.deliver(raw, { from: DEMO.me, to: [DEMO.commands], auth: 'fail' });
  const out = await app.rbe.poll();
  assert.equal(out.results[0].accepted, 0);
  assert.match(out.results[0].reason, /SPF, DKIM, DMARC did not pass/);
});

test('a reply answers an alert once; a replay or someone else\'s reply does not', async () => {
  const { app, memory } = await demo();
  let answered = null;
  app.rbe.onAlertAnswer('board', async (alert, answer) => { answered = answer; return `Moved the task: ${answer}`; });
  const al = await app.rbe.sendAlert({ to: 'jordan@acme.example', title: 'Ship the forms?', question: 'Ship now?', options: ['Yes', 'No'], app: 'board', ref: 'task-1' });
  const alertMail = (await inbox(memory, 'jordan@acme.example')).at(-1);
  assert.match(alertMail.replyTo.address, /^ops\+r_[a-z2-9]{10}_[a-z2-9]{16}@acme\.example$/);
  assert.equal(findReplyTokens(alertMail.messageId).length, 1);

  // Riley replies to Jordan's alert (forwarded to her): refused, the token belongs to Jordan.
  await memory.transport('riley@acme.example').send({ from: 'riley@acme.example', to: alertMail.replyTo.address, subject: `Re: ${alertMail.subject}`, text: 'yes', inReplyTo: alertMail.messageId });
  let out = await app.rbe.poll();
  assert.match(out.results[0].reason, /sent to someone else/);

  await memory.transport('jordan@acme.example').send({ from: 'jordan@acme.example', to: alertMail.replyTo.address, subject: `Re: ${alertMail.subject}`, text: '1\n\nOn Tue, ops wrote:\n> Ship now?', inReplyTo: alertMail.messageId, references: [alertMail.messageId] });
  out = await app.rbe.poll();
  assert.equal(out.results[0].accepted, 1);
  assert.equal(answered, 'Yes');
  assert.equal((await app.rbe.alerts()).find((a) => a.id === al.id).status, 'answered');
  assert.match((await inbox(memory, 'jordan@acme.example')).at(-1).text, /Moved the task: Yes/);

  await memory.transport('jordan@acme.example').send({ from: 'jordan@acme.example', to: alertMail.replyTo.address, subject: 'Re: again', text: 'no', inReplyTo: alertMail.messageId });
  out = await app.rbe.poll();
  assert.match(out.results[0].reason, /already used/);
});

test('deleting by email needs a signed link; looking at the link does nothing, the button does it once', async () => {
  const { app, memory } = await demo();
  const [t] = (await app.callTool('email.search', { q: 'webinar' }, { actor: web(), person: sam })).result.threads;
  await sendAs(memory, DEMO.me, { subject: 'cleanup', text: `delete ${t.id}` });
  await app.rbe.poll();
  const reply = (await inbox(memory, DEMO.me)).at(-1);
  const link = /https:\/\/mail\.test\/act\/(\S+)/.exec(reply.text)?.[1];
  assert.ok(link, reply.text);
  assert.ok(await app.mb.thread(t.id), 'not deleted by the email alone');

  const srv = http.createServer(makeHandler(async () => app, { demo: true }));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  try {
    const look = await fetch(`${base}/act/${link}`);
    assert.equal(look.status, 200);
    assert.match(await look.text(), /Yes, do it/);
    assert.ok(await app.mb.thread(t.id), 'opening the link (as a mail scanner would) deletes nothing');
    const go = await fetch(`${base}/act/${link}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(link)}` });
    assert.equal(go.status, 200, await go.clone().text());
    await assert.rejects(app.mb.thread(t.id), /No thread/);
    const again = await fetch(`${base}/act/${link}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `t=${encodeURIComponent(link)}` });
    assert.equal(again.status, 400);
    const forged = await fetch(`${base}/act/${link.slice(0, -3)}abc`);
    assert.equal(forged.status, 400);
  } finally { srv.closeAllConnections(); srv.close(); }
});

test('an outside send asked by email also needs the link, not a reply', async () => {
  const { app, memory } = await demo();
  const [t] = (await app.callTool('email.search', { q: 'ellis' }, { actor: web(), person: sam })).result.threads;
  await sendAs(memory, DEMO.me, { subject: 'reply', text: `draft ${t.id} use shade A2` });
  await app.rbe.poll();
  const draftId = /Draft ready, not sent \((d_[a-z2-9]+)\)/.exec((await inbox(memory, DEMO.me)).at(-1).text)?.[1];
  assert.ok(draftId);
  await sendAs(memory, DEMO.me, { subject: 'send it', text: `send ${draftId}` });
  await app.rbe.poll();
  assert.match((await inbox(memory, DEMO.me)).at(-1).text, /by clicking, not by replying/);
  const [ap] = await app.mb.approvals();
  const byReply = await app.decide(ap.id, 'approve', { kind: 'person', channel: 'email', name: 'Sam Rivera', email: DEMO.me });
  assert.match(byReply.error, /signed link/);
});

test('mail to ops+crm@ or with "crm:" in the subject goes to the CRM\'s tools only', async () => {
  const { app, memory } = await demo();
  const calls = [];
  app.rbe.registerApp('crm', {
    describe: 'Contacts and deals',
    tools: [{ name: 'crm.find', description: 'Find records', confirm: 'none' }],
    interpret: (text) => ({ tool: 'crm.find', input: { q: text.replace(/^find\s+/i, '') } }),
    call: async (name, input, ctx) => { calls.push({ name, input, who: ctx.actor.email }); return { ok: true, text: '1 match: Dana Okafor (Birch Law)' }; },
  });
  await memory.transport(DEMO.me).send({ from: DEMO.me, to: 'ops+crm@acme.example', subject: 'hello', text: 'find dana' });
  await sendAs(memory, DEMO.me, { subject: 'crm: find birch', text: '' });
  await sendAs(memory, DEMO.me, { subject: 'meet: start a call', text: 'now' });
  const out = await app.rbe.poll();
  assert.deepEqual(calls.map((c) => c.input.q), ['dana', 'birch']);
  assert.equal(calls[0].who, DEMO.me);
  assert.match(out.results[2].result, /no app called "meet"/);
  assert.match((await inbox(memory, DEMO.me)).at(-1).text, /no app called "meet"/);
});

test('the daily digest goes once a day, after the hour', async () => {
  const { app, memory } = await demo();
  await app.mb.setSettings({ digest_hour: 8, digest_tz: 'UTC', last_digest_day: '' });
  assert.equal(await app.rbe.maybeSendDigest(new Date('2026-10-08T07:00:00Z')), null);
  const sent = await app.rbe.maybeSendDigest(new Date('2026-10-08T08:05:00Z'));
  assert.equal(sent.sent.length, 4);
  assert.equal(await app.rbe.maybeSendDigest(new Date('2026-10-08T12:00:00Z')), null);
  const d = (await inbox(memory, DEMO.me)).at(-1);
  assert.match(d.subject, /daily digest/);
  assert.match(d.text, /emails? that need you/);
  assert.match(d.text, /refused/);
});

test('answers in plain words', () => {
  assert.equal(parseAnswer('2', ['Yes', 'No']), 'No');
  assert.equal(parseAnswer('Yes please!\n> old', ['Yes', 'No']), 'Yes');
  assert.equal(parseAnswer('approve', ['Yes', 'No']), 'Yes');
  assert.equal(parseAnswer('nope', ['Yes', 'No']), 'No');
  assert.equal(parseAnswer('maybe later', ['Yes', 'No']), null);
});

test('SPF, DKIM and DMARC are checked for real, with a test DNS', async () => {
  const dns = fakeDns('acme.example');
  const { raw } = await buildRaw({ from: 'sam@acme.example', to: 'ops@acme.example', subject: 'inbox', text: 'inbox', headers: {} });
  const signed = async (bytes) => {
    const sig = await dkimSign(bytes, { signatureData: [{ signingDomain: 'acme.example', selector: dns.selector, privateKey: dns.privateKey }] });
    return Buffer.concat([Buffer.from(sig.signatures), bytes]);
  };
  const received = (ip) => Buffer.from(`Received: from mail.acme.example (mail.acme.example [${ip}]) by mx.test; Wed, 7 Oct 2026 10:00:00 +0000\r\nReturn-Path: <sam@acme.example>\r\n`);
  const ok = await verifySender(Buffer.concat([received('10.1.2.3'), await signed(raw)]), { resolver: dns.resolver });
  assert.equal(ok.ok, true, ok.reason);
  const wrongIp = await verifySender(Buffer.concat([received('203.0.113.9'), await signed(raw)]), { resolver: dns.resolver });
  assert.equal(wrongIp.ok, false);
  assert.match(wrongIp.reason, /SPF/);
  const unsigned = await verifySender(Buffer.concat([received('10.1.2.3'), raw]), { resolver: dns.resolver });
  assert.equal(unsigned.ok, false);
  assert.match(unsigned.reason, /DKIM/);
  const tampered = await signed(raw);
  const bad = await verifySender(Buffer.concat([received('10.1.2.3'), Buffer.from(tampered.toString().replace('inbox\r\n', 'delete everything\r\n'))]), { resolver: dns.resolver });
  assert.equal(bad.ok, false);
});

test('a trusted receiving server\'s verdict is used, but only the topmost one', async () => {
  const { raw } = await buildRaw({ from: 'sam@acme.example', to: 'ops@acme.example', subject: 'x', text: 'x' });
  const top = 'Authentication-Results: mx.trusted.example; spf=pass smtp.mailfrom=sam@acme.example; dkim=pass header.d=acme.example; dmarc=pass header.from=acme.example\r\n';
  const fakeLower = 'Authentication-Results: mx.trusted.example; spf=pass; dkim=pass header.d=acme.example; dmarc=pass\r\n';
  const realTop = 'Authentication-Results: mx.trusted.example; spf=fail; dkim=none; dmarc=fail\r\n';
  assert.equal((await verifySender(Buffer.concat([Buffer.from(top), raw]), { trustedAuthserv: 'mx.trusted.example' })).ok, true);
  assert.equal((await verifySender(Buffer.concat([Buffer.from(realTop + fakeLower), raw]), { trustedAuthserv: 'mx.trusted.example' })).ok, false);
  const otherServer = top.replace('mx.trusted.example', 'mx.liar.example');
  const r = await verifySender(Buffer.concat([Buffer.from(otherServer), raw]), { trustedAuthserv: 'mx.trusted.example', resolver: fakeDns('acme.example').resolver });
  assert.equal(r.ok, false, 'another server\'s header is not trusted');
});

test('client IPs from common Received headers', () => {
  assert.equal(ipOf('from mail.example.com (mail.example.com [203.0.113.5]) by mx.example.net'), '203.0.113.5');
  assert.equal(ipOf('from 192.168.65.1 (HELO [127.0.0.1]); Wed Oct 07 16:11:17 GMT 2026'), '192.168.65.1');
});

test('the run-by-email tools: poll, alerts, digest and the command log', async () => {
  const { app, memory } = await demo();
  const P = { actor: web(), person: sam };
  const call = async (n, i) => { const o = await app.callTool(n, i, P); assert.ok(o.ok, `${n}: ${o.error}`); return o.result; };
  await sendAs(memory, DEMO.me, { subject: 'inbox', text: 'inbox' });
  assert.equal((await call('email.poll_commands', {})).handled, 1);
  const log = (await call('email.list_commands', {})).commands;
  assert.ok(log.some((c) => c.subject === 'inbox' && c.accepted));
  assert.ok(log.some((c) => !c.accepted), 'the forged demo command shows as refused');
  const al = await call('email.send_alert', { to: 'riley@acme.example', title: 'Forms are live', question: 'Announce them?', options: ['Yes', 'No'] });
  assert.ok((await call('email.list_alerts', { status: 'open' })).alerts.some((a) => a.id === al.id));
  assert.deepEqual((await call('email.send_digest', { to: 'riley@acme.example' })).sent, ['riley@acme.example']);
});
