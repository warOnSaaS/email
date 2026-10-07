// Is this command email really from who it says? Only verified mail from team members is acted on.
//
// Two ways to know, in this order:
//  1. The receiving server already checked. Most providers (Gmail, Fastmail, Microsoft 365, Stalwart)
//     stamp an Authentication-Results header at the top. We trust it only when its server id is the one
//     the team configured (trusted_authserv), and only the topmost one: a sender can forge headers
//     lower down, but not the one their receiver adds last.
//  2. We check it ourselves with mailauth (MIT): DKIM signatures over the raw bytes, SPF for the IP in
//     the receiving server's Received header, and DMARC alignment with the From domain.
//
// Policy "strict" (the default, from ROADMAP 2.7): SPF, DKIM and DMARC must all pass, and DKIM must be
// signed by the From domain. Policy "dmarc": DMARC pass is enough (kinder to forwarded mail).
import { authenticate } from 'mailauth';

export async function verifySender(raw, { trustedAuthserv = '', policy = 'strict', resolver, mta = 'wos-email' } = {}) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const head = headerBlock(buf);
  const from = fromDomain(head);
  let res = null;

  if (trustedAuthserv) {
    const ar = headers(head, 'authentication-results')[0];
    if (ar && authservOf(ar) === trustedAuthserv.toLowerCase()) {
      res = { via: 'receiving server', spf: result(ar, 'spf'), dkim: result(ar, 'dkim'), dmarc: result(ar, 'dmarc'), dkimDomain: (/header\.d=([^\s;]+)/i.exec(ar)?.[1] ?? '').toLowerCase() };
    }
  }
  if (!res) {
    const rcvd = headers(head, 'received')[0] ?? '';
    const ip = ipOf(rcvd);
    const sender = (/<([^>]*)>/.exec(headers(head, 'return-path')[0] ?? '')?.[1] ?? '').toLowerCase();
    const out = await authenticate(buf, { ip: ip || '0.0.0.0', helo: heloOf(rcvd), sender: sender || undefined, mta, resolver, disableArc: true, disableBimi: true });
    const good = (out.dkim?.results ?? []).find((r) => r.status?.result === 'pass' && aligned(r.signingDomain, from));
    res = {
      via: 'checked here',
      spf: ip ? out.spf?.status?.result ?? 'none' : 'none',
      dkim: good ? 'pass' : (out.dkim?.results?.[0]?.status?.result ?? 'none'),
      dkimDomain: good?.signingDomain ?? out.dkim?.results?.[0]?.signingDomain ?? '',
      dmarc: out.dmarc?.status?.result ?? 'none',
    };
  }
  const dkimAligned = res.dkim === 'pass' && (!res.dkimDomain || aligned(res.dkimDomain, from));
  const ok = policy === 'dmarc' ? res.dmarc === 'pass' : res.spf === 'pass' && dkimAligned && res.dmarc === 'pass';
  const failed = ['spf', 'dkim', 'dmarc'].filter((k) => (k === 'dkim' ? !dkimAligned : res[k] !== 'pass'));
  return { ...res, from, ok, reason: ok ? 'SPF, DKIM and DMARC passed' : `Not verified: ${failed.join(', ').toUpperCase()} did not pass` };
}

const aligned = (d, from) => { d = String(d ?? '').toLowerCase(); return !!d && (d === from || from.endsWith(`.${d}`) || d.endsWith(`.${from}`)); };

function headerBlock(buf) {
  const s = buf.toString('utf8', 0, Math.min(buf.length, 200000));
  const i = s.search(/\r?\n\r?\n/);
  return (i < 0 ? s : s.slice(0, i)).replace(/\r?\n[ \t]+/g, ' ');
}
const headers = (head, name) => head.split(/\r?\n/).filter((l) => l.toLowerCase().startsWith(`${name}:`)).map((l) => l.slice(name.length + 1).trim());
const fromDomain = (head) => { const f = headers(head, 'from')[0] ?? ''; const a = /<([^>]+)>/.exec(f)?.[1] ?? f; return a.split('@').pop().trim().toLowerCase(); };
const authservOf = (ar) => ar.split(';')[0].trim().split(/\s+/)[0].toLowerCase();
const result = (ar, k) => (new RegExp(`\\b${k}=([a-z]+)`, 'i').exec(ar)?.[1] ?? 'none').toLowerCase();

// The client IP from the receiving server's Received header, in the common shapes:
//   from mail.example.com (mail.example.com [203.0.113.5]) by mx...   (Postfix, Exim, most servers)
//   from 203.0.113.5 (HELO mail.example.com); ...                       (GreenMail and small servers)
export function ipOf(rcvd) {
  const from = /\bfrom\s+(.+?)(\s+by\s|;|$)/i.exec(rcvd)?.[1] ?? '';
  return /^(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(from)?.[1] ?? /\[(?:IPv6:)?([0-9a-f.:]+)\]/i.exec(from)?.[1] ?? '';
}
const heloOf = (rcvd) => /\(HELO\s+([^)\s]+)\)/i.exec(rcvd)?.[1]?.replace(/^\[|\]$/g, '') ?? /\bfrom\s+([^\s(]+)/i.exec(rcvd)?.[1] ?? '';
