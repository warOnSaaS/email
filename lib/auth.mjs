import crypto from 'node:crypto';
import { claimsFor, personForClaims, APP_NAME, CALLBACK_PATH, baseUrl, safeNext } from './account.mjs';

// Sign in with GitHub, for everything: Claude, ChatGPT, Claude Code and Codex connect through standard MCP OAuth
// (discovery, dynamic client registration, PKCE), and the web app uses the same GitHub login with a cookie.
// Who someone is comes from GitHub; whether they are on the team comes from people.yml. No keys anywhere.
// Ported from agent-kanban; keep the two in step.
//
// The hosted copy signs people in with their warOnSaaS account instead (AUTH_PROVIDER=waronsaas, lib/account.mjs):
// the same cookie and tokens, carrying the account id (sub) and session (sid), which is checked with the account
// so "Sign out everywhere" reaches this app. GitHub and the email link stay exactly as they were for self-hosters.

const SECRET = () => process.env.OAUTH_SECRET || 'dev-secret';
const GH_WEB = () => process.env.GITHUB_WEB_BASE || 'https://github.com';
const GH_API = () => process.env.GITHUB_API_BASE || 'https://api.github.com';
const now = () => Math.floor(Date.now() / 1000);
const DAY = 24 * 3600;
const COOKIE = 'wos_email_session';

// ---------- signed, stateless tokens ----------

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')}`;
}

export function verify(token, kind) {
  const [body, mac] = String(token ?? '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
  if (p.k !== kind || (p.exp && p.exp < now())) return null;
  return p;
}

// Tokens carry the GitHub login, so taking someone out of people.yml signs them out everywhere.
// A warOnSaaS sign-in carries the account id instead; the account says whether the session is still live.
// account: the WosAccount, or { account, signouts } with the sign-outs heard through the back channel.
async function personFor(ws, p, account = null) {
  const a = account && typeof account.isLive === 'function' ? { account } : account ?? {};
  if (p && p.sub) {
    if (!a.account) return null;
    if (a.signouts && (await a.signouts.dead(p))) return null;
    return personForClaims(ws, p, a.account);
  }
  // Someone listed by email only signs in with whichever GitHub account holds that verified email.
  // Signed in by email link: the token carries the address instead of a GitHub login.
  if (p && p.e) return (await ws.teamMembers()).find((x) => x.id === p.id && x.email === p.e) ?? null;
  return p ? (await ws.teamMembers()).find((x) => x.id === p.id && (x.github ? sameLogin(x.github, p.g) : !!x.email)) ?? null : null;
}
const sameLogin = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

// What the request's token or cookie says, before anyone looks it up (it is signed, so this is cheap and safe).
export function claimsFromRequest(req) {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (bearer) return verify(bearer, 'access');
  const cookie = /(?:^|;\s*)wos_email_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  return cookie ? verify(decodeURIComponent(cookie), 'access') : null;
}

export async function personFromRequest(ws, req, { account = null } = {}) {
  return personFor(ws, claimsFromRequest(req), account);
}

// extra: the account claims (sub, sid, space, name, email, role) when signed in with a warOnSaaS account.
export function issueTokens(person, extra = {}) {
  const base = { id: person.id, g: person.github, e: person.viaEmail ? person.email : undefined, ...extra, iat: now() };
  return {
    access_token: sign({ k: 'access', ...base, exp: now() + 30 * DAY }),
    refresh_token: sign({ k: 'refresh', ...base, exp: now() + 365 * DAY }),
    token_type: 'bearer',
    expires_in: 30 * DAY,
  };
}

// The app's own session cookie, and the header that clears it.
export const sessionCookie = (token) => `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * DAY}`;
export const clearSessionCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// ---------- discovery ----------

export const resourceMetadata = (host) => ({
  resource: `${host}/mcp`,
  authorization_servers: [host],
  bearer_methods_supported: ['header'],
  resource_name: 'email',
});

export const serverMetadata = (host) => ({
  issuer: host,
  authorization_endpoint: `${host}/oauth/authorize`,
  token_endpoint: `${host}/oauth/token`,
  registration_endpoint: `${host}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  scopes_supported: ['workspace'],
});

export const challenge = (host) => `Bearer resource_metadata="${host}/.well-known/oauth-protected-resource"`;

// ---------- clients ----------

// Registration is stateless: the client id is a signed copy of what the app registered.
export async function handleRegister(req, res) {
  const b = await bodyObject(req);
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter(okRedirect) : [];
  if (!uris.length) return json(res, 400, { error: 'invalid_redirect_uri' });
  const client_id = sign({ k: 'client', r: uris, n: String(b.client_name ?? '').slice(0, 80) });
  json(res, 201, { client_id, client_name: b.client_name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: now() });
}

// https anywhere, or a loopback address for desktop and terminal apps (Claude Code, Codex).
function okRedirect(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
  } catch {
    return false;
  }
}

// The ChatGPT GPT is a fixed client with a secret; everything else registers itself and uses PKCE.
function clientFor(client_id) {
  if (client_id && client_id === process.env.OAUTH_CLIENT_ID) {
    return { fixed: true, allows: (r) => { try { return ['chatgpt.com', 'chat.openai.com'].includes(new URL(r).hostname); } catch { return false; } } };
  }
  const c = verify(client_id, 'client');
  return c ? { fixed: false, allows: (r) => c.r.includes(r) } : null;
}

// ---------- sign in ----------

export async function handleAuthorize(req, res, host, { account = null, env = process.env } = {}) {
  const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const client = clientFor(q.client_id);
  if (!client || !client.allows(q.redirect_uri)) return page(res, 400, '<h1>This sign-in link is not valid</h1><p>Start again from your app.</p>');
  if (!client.fixed && (!q.code_challenge || (q.code_challenge_method ?? 'S256') !== 'S256')) return page(res, 400, '<h1>This app must use PKCE</h1>');
  const carry = { c: q.client_id, r: q.redirect_uri, s: q.state, cc: q.code_challenge };
  if (account) {
    // The AI app connects through the person's warOnSaaS account, as a connection it can see and end.
    const name = client.fixed ? 'ChatGPT' : verify(q.client_id, 'client')?.n || 'An AI app';
    return accountRedirect(res, host, account, env, { carry, connection: `${name} via ${APP_NAME}` });
  }
  githubRedirect(res, host, carry);
}

// Any page asks for a browser login with /login?next=/contacts.
export function handleLogin(req, res, host, { account = null } = {}) {
  const next = safeNext(new URL(req.url, 'http://x').searchParams.get('next') ?? '/');
  if (account) return res.writeHead(302, { location: `/auth/waronsaas?next=${encodeURIComponent(next)}`, 'cache-control': 'no-store' }).end();
  githubRedirect(res, host, { web: next });
}

// ---------- sign in with a warOnSaaS account (the hosted copy) ----------

function accountRedirect(res, host, account, env, { next = '/', carry = null, prompt = null, provider = null, connection = null }) {
  const { location, cookie } = account.start({ next, carry, prompt, provider, connection, redirectUri: `${baseUrl(env, host)}${CALLBACK_PATH}`, secure: host.startsWith('https') });
  res.writeHead(302, { location, 'set-cookie': cookie, 'cache-control': 'no-store' }).end();
}

// GET /auth/waronsaas?next=/settings[&prompt=none][&provider=github|google]
export function handleAccountStart(req, res, host, account, env = process.env) {
  const q = new URL(req.url, 'http://x').searchParams;
  const prompt = q.get('prompt') === 'none' ? 'none' : null;
  const provider = ['github', 'google'].includes(q.get('provider')) ? q.get('provider') : null;
  accountRedirect(res, host, account, env, { next: safeNext(q.get('next') ?? '/'), prompt, provider });
}

// GET /auth/waronsaas/callback. wsFor(space) gives the mailbox the person works in, so the first sign-in
// can make them a member there. On any error the page they came from opens as before, signed out.
export async function handleAccountCallback(req, res, account, wsFor) {
  const r = await account.finish(req);
  if (r.error) {
    if (r.carry?.r) return mcpDeny(res, r.carry, r.error === 'access_denied' ? 'access_denied' : 'login_required', r.clear);
    return res.writeHead(302, { location: safeNext(r.next), 'set-cookie': r.clear, 'cache-control': 'no-store' }).end();
  }
  const claims = claimsFor(r.profile);
  if (r.carry?.r) {
    // An AI app's pending authorization request: hand it a code, as the GitHub callback did.
    const st = r.carry;
    const code = sign({ k: 'code', ...claims, c: st.c, r: st.r, cc: st.cc, exp: now() + 300 });
    const to = new URL(st.r);
    to.searchParams.set('code', code);
    if (st.s) to.searchParams.set('state', st.s);
    return res.writeHead(302, { location: to.toString(), 'set-cookie': r.clear, 'cache-control': 'no-store' }).end();
  }
  const person = await personForClaims(await wsFor(claims.sp), claims, account);
  if (!person) return res.writeHead(302, { location: safeNext(r.next), 'set-cookie': r.clear, 'cache-control': 'no-store' }).end();
  const t = issueTokens(person, claims);
  res.writeHead(302, { location: safeNext(r.next), 'set-cookie': [sessionCookie(t.access_token), r.clear], 'cache-control': 'no-store' }).end();
}

function mcpDeny(res, st, error, clear) {
  const to = new URL(st.r);
  to.searchParams.set('error', error);
  if (st.s) to.searchParams.set('state', st.s);
  res.writeHead(302, { location: to.toString(), 'set-cookie': clear, 'cache-control': 'no-store' }).end();
}

// POST /auth/waronsaas/backchannel: the account says someone pressed "Sign out everywhere" or deleted
// their account. Every token and cookie of theirs issued so far is dead at once; a deleted account's own
// space goes too (lib/hosted.mjs). Always 200, so the account never retries a token it already sent.
export async function handleBackchannel(req, res, { account, signouts, removeAccount }) {
  const b = await bodyObject(req);
  const t = b.logout_token ? await account.verifyLogoutToken(String(b.logout_token)).catch(() => null) : null;
  if (!t?.sub) return json(res, 200, { ok: false });
  await signouts.mark(t.sub, { deleted: t.deleted });
  if (t.deleted && removeAccount) await removeAccount(t.sub).catch((e) => console.error('backchannel: could not remove the account\'s space', e.message));
  json(res, 200, { ok: true, deleted: !!t.deleted });
}

// Sign out of this app, then of the account too when this install uses one.
export function handleLogout(req, res, host, { account = null, env = process.env } = {}) {
  res.writeHead(302, { location: account ? account.endSessionUrl(baseUrl(env, host)) : '/', 'set-cookie': clearSessionCookie, 'cache-control': 'no-store' }).end();
}

function githubRedirect(res, host, carry) {
  const state = sign({ k: 'gh', ...carry, exp: now() + 900 });
  const u = new URL(`${GH_WEB()}/login/oauth/authorize`);
  u.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID ?? '');
  u.searchParams.set('redirect_uri', `${host}/oauth/github/callback`);
  u.searchParams.set('scope', 'read:user user:email');
  u.searchParams.set('state', state);
  u.searchParams.set('allow_signup', 'true');
  res.writeHead(302, { location: u.toString(), 'cache-control': 'no-store' }).end();
}

export async function handleGithubCallback(req, res, ws, host) {
  const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const st = verify(q.state, 'gh');
  if (!st || !q.code) return page(res, 400, '<h1>Sign-in expired</h1><p>Go back to your app and try again.</p>');

  const tok = await fetch(`${GH_WEB()}/login/oauth/access_token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET, code: q.code, redirect_uri: `${host}/oauth/github/callback` }),
  }).then((r) => r.json()).catch(() => ({}));
  if (!tok.access_token) return page(res, 400, '<h1>GitHub sign-in failed</h1><p>Try again from your app.</p>');
  const gh = (p) => fetch(`${GH_API()}${p}`, { headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'warOnSaaS-email' } }).then((r) => (r.ok ? r.json() : null));
  const [user, emails] = await Promise.all([gh('/user'), gh('/user/emails')]);
  if (!user?.login) return page(res, 400, '<h1>GitHub sign-in failed</h1><p>Try again from your app.</p>');
  const verified = (emails ?? []).filter((e) => e.verified).map((e) => e.email.toLowerCase());

  const found = await ws.personByGithub(user.login, verified);
  const person = found && { ...found, github: found.github ?? user.login };
  if (!person) {
    return page(res, 403, `<h1>Hi @${esc(user.login)}</h1><p>You're signed in to GitHub, but you're not on the ${esc(ws.name)} team yet.</p><p>Send ${esc(process.env.WORKSPACE_CONTACT || 'the person who invited you')} your username: <b>${esc(user.login)}</b>. Once you're added, come back and sign in again.</p>`);
  }
  if (st.web) {
    const t = issueTokens(person);
    res.writeHead(302, { location: st.web, 'set-cookie': `${COOKIE}=${encodeURIComponent(t.access_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * DAY}`, 'cache-control': 'no-store' }).end();
    return;
  }
  const code = sign({ k: 'code', id: person.id, g: person.github, c: st.c, r: st.r, cc: st.cc, exp: now() + 300 });
  const to = new URL(st.r);
  to.searchParams.set('code', code);
  if (st.s) to.searchParams.set('state', st.s);
  res.writeHead(302, { location: to.toString(), 'cache-control': 'no-store' }).end();
}

// ws: the team's mailbox, or a function of the grant (the hosted copy picks the space the token names).
export async function handleToken(req, res, ws, { account = null, signouts = null } = {}) {
  const q = await bodyObject(req);
  const basic = (req.headers.authorization ?? '').startsWith('Basic ') ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString().split(':') : [];
  const client_id = q.client_id ?? basic[0];
  const secret = q.client_secret ?? basic[1];
  const client = clientFor(client_id);
  if (!client || (client.fixed && secret !== process.env.OAUTH_CLIENT_SECRET)) return json(res, 401, { error: 'invalid_client' });

  let grant = null;
  if (q.grant_type === 'authorization_code') {
    grant = verify(q.code, 'code');
    if (grant && (grant.c !== client_id || (q.redirect_uri && grant.r !== q.redirect_uri))) grant = null;
    if (grant && grant.cc) {
      const s256 = crypto.createHash('sha256').update(String(q.code_verifier ?? '')).digest('base64url');
      if (s256 !== grant.cc) grant = null;
    } else if (grant && !client.fixed) grant = null;
  } else if (q.grant_type === 'refresh_token') {
    grant = verify(q.refresh_token, 'refresh');
  }
  const mb = typeof ws === 'function' ? await ws(grant) : ws;
  const person = grant && (await personFor(mb, grant, { account, signouts }));
  if (!person) return json(res, 400, { error: 'invalid_grant' });
  const extra = grant.sub ? { sub: grant.sub, sid: grant.sid, sp: grant.sp, n: grant.n, e: grant.e, ev: grant.ev, r: grant.r } : {};
  json(res, 200, withApp(issueTokens(person, extra), client.fixed ? 'GPT' : grant.a ?? verify(client_id, 'client')?.n));
}

// The app a token was issued to (the name it registered with, or GPT), so the live feed can say
// "Claude (Sam's)" instead of just "Sam". Carried into refreshed tokens. Same as agent-kanban.
function withApp(t, app) {
  if (!app) return t;
  const again = (tok, kind) => { const p = verify(tok, kind); return p ? sign({ ...p, a: String(app).slice(0, 60) }) : tok; };
  return { ...t, access_token: again(t.access_token, 'access'), refresh_token: again(t.refresh_token, 'refresh') };
}

// ---------- bits ----------

export async function bodyObject(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = typeof req.body === 'string' ? req.body : '';
  if (!s) for await (const c of req) s += c;
  if (!s) return {};
  try {
    return (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(s) : Object.fromEntries(new URLSearchParams(s));
  } catch {
    return {};
  }
}

export const json = (res, status, obj, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }).end(JSON.stringify(obj));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function page(res, status, inner, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-frame-options': 'DENY', ...headers }).end(`<!doctype html><html lang="en" data-mode="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email</title><meta name="robots" content="noindex"><meta name="color-scheme" content="dark light">
<link rel="stylesheet" href="/ui/src/ui.css"><link rel="stylesheet" href="/ui/themes/ops.css"><link rel="stylesheet" href="/app/email.css">
</head><body class="gate"><main class="gate-card">${inner}</main></body></html>`);
}

// ---------- sign in with an email link ----------
// For people without GitHub. The link is signed, works once and for 15 minutes, and opens a page with a
// button: mail scanners that open every link never sign anyone in.

export async function handleEmailLogin(req, res, app, host) {
  const b = await bodyObject(req);
  const email = String(b.email ?? '').trim().toLowerCase();
  const next = typeof b.next === 'string' && b.next.startsWith('/') && !b.next.startsWith('//') ? b.next : '/';
  const member = email && (await app.mb.memberByEmail(email));
  // Same answer either way, so the form does not reveal who is on the team.
  const done = () => page(res, 200, `<span class="gate-mark" aria-hidden="true"></span><h1>Check your email</h1><p>If ${esc(email || 'that address')} is on the team, a sign-in link is on its way. It works once, for 15 minutes.</p>`);
  if (!member) return done();
  const { issue } = await import('./runbyemail/tokens.mjs');
  const token = await issue(app.db, app.mb.team, { kind: 'login', subject_id: member.id, member: member.email });
  const url = `${host}/login/email/open?t=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  try {
    await sendSystemMail(app, { to: member.email, subject: 'Your sign-in link', text: `Sign in to ${app.mb.name}:\n${url}\n\nIt works once, for 15 minutes. If you did not ask for it, ignore this email.` });
  } catch (e) {
    console.error('email sign-in: could not send', e.message);
  }
  return done();
}

export async function handleEmailOpen(req, res, app) {
  const { check, consume } = await import('./runbyemail/tokens.mjs');
  const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const b = req.method === 'POST' ? await bodyObject(req) : {};
  const token = b.t ?? q.t;
  const next = String(b.next ?? q.next ?? '/');
  if (req.method !== 'POST') {
    const row = await check(app.db, app.mb.team, token, { kind: 'login' });
    if (row.error) return page(res, 400, `<h1>This link does not work</h1><p>${esc(row.error)}. Ask for a new one.</p><a class="btn btn-p btn-block" href="/">Start again</a>`);
    return page(res, 200, `<span class="gate-mark" aria-hidden="true"></span><h1>Sign in as ${esc(row.member)}</h1><form method="post"><input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="next" value="${esc(next)}"><button class="btn btn-p btn-block" type="submit">Sign in</button></form>`);
  }
  const row = await consume(app.db, app.mb.team, token, { kind: 'login' });
  if (row.error) return page(res, 400, `<h1>This link does not work</h1><p>${esc(row.error)}. Ask for a new one.</p>`);
  const member = await app.mb.memberByEmail(row.member);
  if (!member) return page(res, 403, '<h1>You are not on the team any more</h1>');
  const t = issueTokens({ ...member, viaEmail: true });
  res.writeHead(303, { location: next.startsWith('/') && !next.startsWith('//') ? next : '/', 'set-cookie': `wos_email_session=${encodeURIComponent(t.access_token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * DAY}`, 'cache-control': 'no-store' }).end();
}

// Mail the app itself sends (sign-in links): SMTP_URL if set, else the team command mailbox.
async function sendSystemMail(app, msg) {
  if (process.env.SMTP_URL) {
    const { default: nodemailer } = await import('nodemailer');
    return nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.MAIL_FROM || 'wOS <no-reply@localhost>', ...msg });
  }
  const acct = await app.rbe.commandAccount();
  if (!acct) throw new Error('Set SMTP_URL or connect a command mailbox to send sign-in links');
  return app.mb.transport(acct).send({ from: acct.address, ...msg });
}
