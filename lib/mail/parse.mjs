// Raw message bytes in, one plain object out. mailparser does the MIME work.
import { simpleParser } from 'mailparser';

const addrs = (v) => (v ? (Array.isArray(v) ? v : [v]).flatMap((x) => x.value ?? []).map((a) => ({ address: String(a.address ?? '').toLowerCase(), name: a.name || '' })).filter((a) => a.address) : []);

export async function parseRaw(raw) {
  const m = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
  const from = addrs(m.from)[0] ?? { address: 'unknown@unknown', name: '' };
  const refs = m.references ? (Array.isArray(m.references) ? m.references : String(m.references).split(/\s+/)) : [];
  const text = (m.text ?? htmlToText(m.html || '')).replace(/\r/g, '');
  return {
    messageId: m.messageId || `<no-id-${Date.now()}-${Math.random().toString(36).slice(2)}@wos.local>`,
    inReplyTo: m.inReplyTo || null,
    references: refs.filter(Boolean),
    from,
    to: addrs(m.to),
    cc: addrs(m.cc),
    replyTo: addrs(m.replyTo)[0] ?? null,
    subject: m.subject ?? '',
    date: (m.date ?? new Date()).getTime(),
    text,
    html: typeof m.html === 'string' ? m.html : '',
    attachments: (m.attachments ?? []).map((a) => ({ filename: a.filename || 'attachment', contentType: a.contentType, size: a.size })),
    listUnsubscribe: m.headers.get('list-unsubscribe') ? JSON.stringify(m.headers.get('list-unsubscribe')) : null,
    precedence: String(m.headers.get('precedence') ?? '').toLowerCase(),
    wos: String(m.headers.get('x-wos') ?? '').toLowerCase(),
    autoSubmitted: String(m.headers.get('auto-submitted') ?? '').toLowerCase(),
    headerLines: m.headerLines ?? [],
  };
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

// The new part of a reply: everything above the quoted history.
export function newPart(text) {
  const lines = String(text).split('\n');
  const out = [];
  for (const l of lines) {
    if (/^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From: .+/.test(l) && out.length) break;
    if (l.startsWith('>')) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}

export const snippetOf = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, 180);
