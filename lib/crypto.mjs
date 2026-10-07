// Secrets at rest, signatures and ids.
//   EMAIL_SECRET_KEY  the key that encrypts mailbox passwords (AES-256-GCM). Kept outside the database:
//                     a stolen database alone does not open anyone's mailbox. Any long random string.
//   OAUTH_SECRET      signs sessions, reply tokens and signed links (HMAC-SHA256).
import crypto from 'node:crypto';

const DEV = 'wos-email-dev-only-not-secret';
let warned = false;

function secretKey(env = process.env) {
  const raw = env.EMAIL_SECRET_KEY;
  if (!raw && !warned && env.NODE_ENV === 'production' && !env.WOS_DEMO) {
    warned = true;
    console.warn('EMAIL_SECRET_KEY is not set: mailbox passwords are encrypted with a development key. Set it before connecting a real mailbox.');
  }
  return crypto.scryptSync(raw || DEV, 'wos-email/secrets/v1', 32);
}

export function encrypt(obj, env) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(env), iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

export function decrypt(text, env) {
  const [v, iv, tag, body] = String(text).split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(env), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8'));
}

const signingSecret = () => process.env.OAUTH_SECRET || 'dev-secret';

export const mac = (text, bytes = 32) => crypto.createHmac('sha256', signingSecret()).update(text).digest().subarray(0, bytes).toString('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Short ids that fit inside an email address (lower case letters and digits only).
const ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
export function id(prefix = '', n = 12) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (const x of b) s += ALPHA[x % ALPHA.length];
  return prefix + s;
}

// A short signature that also fits in an address local part: 80 bits as 16 base32 characters.
export function shortMac(text) {
  const b = crypto.createHmac('sha256', signingSecret()).update(text).digest().subarray(0, 10);
  let bits = 0, val = 0, s = '';
  for (const x of b) {
    val = (val << 8) | x; bits += 8;
    while (bits >= 5) { s += ALPHA[(val >> (bits - 5)) & 31]; bits -= 5; }
  }
  return s;
}
