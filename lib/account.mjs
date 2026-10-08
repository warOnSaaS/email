// Sign-in with a warOnSaaS account (the hosted copy at mail.waronsaas.com). "Look freely, sign in to use":
// every page is open to a signed-out visitor, who sees the demo mailbox; any action needs a free account.
// Self-hosted installs keep GitHub or the email link through AUTH_PROVIDER (see README).
import { WosAccount, authProvider } from './account-client.mjs';

export { WosAccount, authProvider };

export const APP_NAME = 'Email';
export const CALLBACK_PATH = '/auth/waronsaas/callback';
const SIGN_IN = 'Sign in to your warOnSaaS account';

// The account client for this install, or null when this install does not use the account.
export function accountFor(env = process.env) {
  if (authProvider(env) !== 'waronsaas') return null;
  return WosAccount.fromEnv(env, { redirectUri: `${baseUrl(env)}${CALLBACK_PATH}`, secret: env.OAUTH_SECRET });
}

export const baseUrl = (env = process.env, host = 'http://localhost:3990') => String(env.PUBLIC_URL || host).replace(/\/$/, '');

// The space a signed-in account works in: their first warOnSaaS team, else a space of their own.
// Role in a team space follows the team; in a space of their own they are the owner.
export function spaceFor(profile) {
  const t = Array.isArray(profile.teams) ? profile.teams[0] : null;
  if (t?.id) return { sp: `team:${t.id}`, role: ['owner', 'admin'].includes(String(t.role)) ? String(t.role) : 'member' };
  return { sp: `acct:${profile.sub}`, role: 'owner' };
}

// What the app keeps about a sign-in, in its own cookie and in the tokens it issues to AI apps.
// sub: the account id (stable); sid: this sign-in's session, checked with the account on every read.
export function claimsFor(profile) {
  const { sp, role } = spaceFor(profile);
  return { sub: profile.sub, sid: profile.sid, sp, n: profile.name || (profile.email ? profile.email.split('@')[0] : 'Someone'), e: profile.email ? String(profile.email).toLowerCase() : null, ev: !!profile.email_verified, r: role };
}

// The member for a sign-in. The first visit makes them: match an existing teammate once by verified email,
// then store the account id. A space without a database starts again on a new server, so this also
// recreates them from their own cookie. Null when the account session has ended ("Sign out everywhere").
export async function personForClaims(mb, c, account) {
  if (!c?.sub) return null;
  if (account && !(await account.isLive(c.sid))) return null;
  let m = await mb.memberBySub(c.sub);
  if (!m && c.e && c.ev) {
    const byEmail = await mb.memberByEmail(c.e);
    if (byEmail && !byEmail.sub) m = await mb.setMemberSub(byEmail.id, c.sub);
  }
  if (!m) m = await mb.addMember({ name: c.n, email: c.e || `${String(c.sub).toLowerCase().replace(/[^a-z0-9]+/g, '-')}@account.invalid`, role: c.r || 'member', sub: c.sub });
  return { ...m, github: m.github || null, sub: c.sub };
}

export const signInError = { code: 'sign_in', message: SIGN_IN };

// The browser prompt: catches a signed-out press on any action and offers sign-in, without walling the page.
export function promptScript({ signedIn, issuer = 'https://account.waronsaas.com' }) {
  return `<script src="${issuer.replace(/\/$/, '')}/prompt.js" defer data-signed-in="${signedIn ? 'true' : 'false'}" data-app="${APP_NAME}" data-signin="/auth/waronsaas"></script>`;
}

export const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/');
