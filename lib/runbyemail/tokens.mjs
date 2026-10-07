// Signed, one-time tokens.
//   reply  rides in an alert's Reply-To (ops+r_<id>_<sig>@...) and Message-ID, so a reply can answer it.
//          A forged reply has no valid signature; a replayed one finds the token used.
//   link   a signed link a person must click (and then press a button) for anything destructive.
//   login  the email sign-in link.
// The signature is an HMAC over kind, id and the member it was issued to, so a token copied to
// someone else's message does not verify for them.
import { id as newId, shortMac, mac, safeEqual } from '../crypto.mjs';

const PREFIX = { reply: 'r', link: 'k', login: 'g' };
const TTL = { reply: 7 * 24 * 3600e3, link: 24 * 3600e3, login: 15 * 60e3 };

export async function issue(db, team, { kind, subject_id = null, member = null, ttl }) {
  const tid = newId('', 10);
  const t = Date.now();
  await db.run('INSERT INTO tokens (id, team_id, kind, subject_id, member, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [tid, team, kind, subject_id, member, t + (ttl ?? TTL[kind]), t]);
  return encode(kind, tid, member);
}

function encode(kind, tid, member) {
  if (kind === 'reply') return `r_${tid}_${shortMac(`reply.${tid}.${member ?? ''}`)}`;
  return `${PREFIX[kind]}_${tid}_${mac(`${kind}.${tid}.${member ?? ''}`, 24)}`;
}

// Finds a reply token anywhere in a string (an address, a Message-ID, a References header).
export const findReplyTokens = (s) => [...String(s ?? '').matchAll(/\br_([a-z2-9]{10})_([a-z2-9]{16})\b/g)].map((m) => m[0]);

// Checks a token. Returns the row when valid, or { error } in plain words.
export async function check(db, team, token, { kind, member } = {}) {
  const m = /^([rkg])_([a-z2-9]{10})_([A-Za-z0-9_-]+)$/.exec(String(token ?? ''));
  if (!m) return { error: 'This link or reply is not one of ours' };
  const row = await db.get('SELECT * FROM tokens WHERE team_id = ? AND id = ?', [team, m[2]]);
  if (!row || (kind && row.kind !== kind)) return { error: 'This link or reply is not one of ours' };
  if (!safeEqual(encode(row.kind, row.id, row.member), token)) return { error: 'The signature does not match' };
  if (member && row.member && row.member.toLowerCase() !== String(member).toLowerCase()) return { error: 'This was sent to someone else' };
  if (row.used_at) return { error: 'This was already used' };
  if (row.expires_at < Date.now()) return { error: 'This has expired' };
  return row;
}

// Uses a token exactly once, even when two requests race.
export async function consume(db, team, token, opts) {
  const row = await check(db, team, token, opts);
  if (row.error) return row;
  const r = await db.run('UPDATE tokens SET used_at = ? WHERE id = ? AND used_at IS NULL', [Date.now(), row.id]);
  return r.changes === 1 ? row : { error: 'This was already used' };
}
