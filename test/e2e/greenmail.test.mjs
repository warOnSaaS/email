// End to end against a real mail server (GreenMail: SMTP and IMAP) and a real Postgres, both in Docker:
// a teammate emails a command, wOS checks SPF, DKIM and DMARC, acts, and the reply lands in their inbox
// over IMAP. Run with: npm run test:e2e  (needs Docker; or set GREENMAIL_HOST and E2E_DATABASE_URL).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { dkimSign } from 'mailauth/lib/dkim/sign.js';
import { createEmailApp } from '../../lib/app.mjs';
import { openDb } from '../../lib/db.mjs';
import { buildRaw } from '../../lib/mail/compose.mjs';
import { parseRaw } from '../../lib/mail/parse.mjs';
import { fakeDns } from '../helpers.mjs';

const HOST = process.env.GREENMAIL_HOST || '127.0.0.1';
let SMTP = Number(process.env.GREENMAIL_SMTP_PORT || 3025), IMAP = Number(process.env.GREENMAIL_IMAP_PORT || 3143), PG;
const started = [];
let app, db;
const dns = fakeDns('acme.example');
const person = { email: 'sam@acme.example' };
const actor = { kind: 'person', channel: 'web', name: 'Sam Rivera' };
const call = async (name, input) => { const o = await app.callTool(name, input, { actor, person }); assert.ok(o.ok, `${name}: ${o.error}`); return o; };

const open = (port) => new Promise((r) => { const s = net.connect(port, HOST, () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
async function waitFor(port, ms = 60000) { const end = Date.now() + ms; while (Date.now() < end) { if (await open(port)) return; await new Promise((r) => setTimeout(r, 500)); } throw new Error(`port ${port} never opened`); }
function docker(...args) { return execFileSync('docker', args, { encoding: 'utf8' }).trim(); }

before(async () => {
  if (!process.env.GREENMAIL_HOST) {
    // Our own GreenMail on free ports, so we never touch a server someone else is using.
    started.push(docker('run', '-d', '--rm', '-p', '127.0.0.1::3025', '-p', '127.0.0.1::3143', '-e', 'GREENMAIL_OPTS=-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.auth.disabled', 'greenmail/standalone:2.1.2'));
    const port = (c) => Number(docker('port', started.at(-1), c).split('\n')[0].split(':').pop());
    SMTP = port('3025'); IMAP = port('3143');
    await waitFor(IMAP);
    await new Promise((r) => setTimeout(r, 1500));
  }
  let url = process.env.E2E_DATABASE_URL;
  if (!url) {
    started.push(docker('run', '-d', '--rm', '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=wos', '-e', 'POSTGRES_DB=wos_email', 'postgres:16-alpine'));
    PG = Number(docker('port', started.at(-1), '5432').split('\n')[0].split(':').pop());
    await waitFor(PG);
    url = `postgres://postgres:wos@127.0.0.1:${PG}/wos_email`;
    for (let i = 0; i < 40; i++) { try { db = await openDb({ url }); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  } else db = await openDb({ url });
  assert.ok(db, 'Postgres did not start');
  app = await createEmailApp({ db, env: { PUBLIC_URL: 'https://mail.test', EMAIL_SECRET_KEY: 'e2e-key-'.repeat(5), FILES_DIR: '' }, resolver: dns.resolver });
  await app.mb.addMember({ name: 'Sam Rivera', email: 'sam@acme.example', role: 'owner' });
  await app.mb.addMember({ name: 'Jordan Lee', email: 'jordan@acme.example', role: 'admin' });
  await app.mb.setSettings({ team_domains: ['acme.example'] });
});

after(async () => {
  await db?.close().catch(() => {});
  for (const id of started) { try { docker('rm', '-f', id); } catch {} }
});

const smtp = () => nodemailer.createTransport({ host: HOST, port: SMTP, secure: false, ignoreTLS: true });
// What Sam's own mail server does: sign with DKIM and send.
async function sendSigned(msg) {
  const { raw, messageId } = await buildRaw(msg);
  const sig = await dkimSign(raw, { signatureData: [{ signingDomain: 'acme.example', selector: dns.selector, privateKey: dns.privateKey }] });
  await smtp().sendMail({ envelope: { from: msg.from, to: [msg.to].flat() }, raw: Buffer.concat([Buffer.from(sig.signatures), raw]) });
  return messageId;
}
async function imapList(user, folder = 'INBOX') {
  const c = new ImapFlow({ host: HOST, port: IMAP, secure: false, auth: { user, pass: 'test' }, logger: false });
  await c.connect();
  const out = [];
  try {
    const exists = (await c.list()).some((f) => f.path === folder);
    if (exists) { const lock = await c.getMailboxLock(folder); try { if (c.mailbox.exists) for await (const m of c.fetch('1:*', { envelope: true, source: true })) { const p = await parseRaw(m.source); out.push({ ...m.envelope, inReplyTo: p.inReplyTo, replyTo: p.replyTo ? [p.replyTo] : m.envelope.replyTo }); } } finally { lock.release(); } }
  } finally { await c.logout(); }
  return out;
}
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 300)); } return v; };

test('connect two mailboxes over IMAP and SMTP, with the password encrypted in Postgres', async () => {
  const conn = { imap_host: HOST, imap_port: IMAP, smtp_host: HOST, smtp_port: SMTP, password: 'test-password-e2e' };
  await call('email.connect_account', { address: 'sam@acme.example', name: 'Sam Rivera', ...conn });
  await call('email.connect_account', { address: 'ops@acme.example', purpose: 'commands', ...conn });
  const rows = await db.all('SELECT auth FROM email_accounts');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => !r.auth.includes('test-password')));
});

test('mail arrives, is threaded and sorted', async () => {
  await smtp().sendMail({ from: 'Dana Okafor <dana@birch-law.example>', to: 'sam@acme.example', subject: 'Lease renewal for the Elm Street office', text: 'Can you confirm by Friday whether you want a two-year term?' });
  const t = await until(async () => { await call('email.sync', {}); return (await call('email.search', { q: 'lease' })).result.threads[0]; });
  assert.ok(t, 'the message never synced');
  assert.equal(t.triage, 'needs_you');
});

test('a command email is verified, done, and answered in the teammate\'s inbox', async () => {
  const cmdId = await sendSigned({ from: 'sam@acme.example', to: 'ops@acme.example', subject: 'search lease', text: 'search lease' });
  const polled = await until(async () => { const r = await app.rbe.poll(); return r.handled ? r : null; });
  assert.equal(polled.results[0].accepted, 1, polled.results[0].reason);
  const verified = JSON.parse((await db.get('SELECT verified FROM email_commands WHERE message_id = ?', [cmdId])).verified);
  assert.deepEqual([verified.spf, verified.dkim, verified.dmarc], ['pass', 'pass', 'pass']);
  const reply = await until(async () => (await imapList('sam@acme.example')).find((e) => e.inReplyTo === cmdId));
  assert.ok(reply, `no reply in Sam's inbox: ${JSON.stringify((await imapList('sam@acme.example')).map((e) => [e.subject, e.inReplyTo]))} want ${cmdId}`);
  assert.equal(reply.subject, 'Re: search lease');
  // The handled command left the command inbox, so a restart cannot run it twice.
  assert.equal((await imapList('ops@acme.example')).length, 0);
});

test('an archive command moves the mail on the real server', async () => {
  const [t] = (await call('email.search', { q: 'lease renewal' })).result.threads;
  await sendSigned({ from: 'sam@acme.example', to: 'ops@acme.example', subject: 'tidy', text: `archive ${t.id}` });
  await until(async () => (await app.rbe.poll()).handled);
  assert.equal((await app.mb.thread(t.id)).archived, 1);
  const inbox = await imapList('sam@acme.example');
  assert.ok(!inbox.some((e) => /Lease renewal/.test(e.subject)), 'still in INBOX on the server');
  assert.ok((await imapList('sam@acme.example', 'Archive')).some((e) => /Lease renewal/.test(e.subject)));
});

test('a reply answers an alert; an unsigned forgery is refused', async () => {
  let answer;
  app.rbe.onAlertAnswer('board', async (_a, ans) => { answer = ans; });
  await app.rbe.sendAlert({ to: 'sam@acme.example', title: 'Approve overtime?', question: 'Approve?', options: ['Yes', 'No'], app: 'board' });
  const alert = await until(async () => (await imapList('sam@acme.example')).find((e) => /Approve overtime/.test(e.subject)));
  assert.match(alert.replyTo[0].address, /^ops\+r_/);
  await sendSigned({ from: 'sam@acme.example', to: alert.replyTo[0].address.replace(/\+[^@]+/, ''), subject: `Re: ${alert.subject}`, text: 'yes', inReplyTo: alert.messageId, references: [alert.messageId] });
  await until(async () => (await app.rbe.poll()).handled);
  assert.equal(answer, 'Yes');

  await smtp().sendMail({ from: 'sam@acme.example', to: 'ops@acme.example', subject: 'inbox', text: 'inbox' });
  const r = await until(async () => { const x = await app.rbe.poll(); return x.handled ? x : null; });
  assert.equal(r.results[0].accepted, 0);
  assert.match(r.results[0].reason, /DKIM/);
});
