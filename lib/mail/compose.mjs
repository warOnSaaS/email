// Builds a real RFC 5322 message from a plain object, so every transport (SMTP or the in-memory one)
// sends exactly the bytes a mail server would see.
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { id } from '../crypto.mjs';

export function newMessageId(domain) {
  return `<${id('m', 16)}@${domain || 'wos.local'}>`;
}

export const domainOf = (addr) => String(addr ?? '').split('@').pop().toLowerCase().replace(/>$/, '');

export async function buildRaw(msg) {
  const from = typeof msg.from === 'string' ? msg.from : msg.from?.address;
  const messageId = msg.messageId || newMessageId(domainOf(from));
  const mail = new MailComposer({
    from: msg.from,
    to: msg.to,
    cc: msg.cc?.length ? msg.cc : undefined,
    replyTo: msg.replyTo,
    subject: msg.subject ?? '',
    text: msg.text ?? '',
    html: msg.html,
    inReplyTo: msg.inReplyTo,
    references: msg.references?.length ? msg.references : undefined,
    messageId,
    date: msg.date ?? new Date(),
    headers: msg.headers ?? {},
    dkim: msg.dkim,
    attachments: msg.attachments,
  });
  const raw = await new Promise((resolve, reject) => mail.compile().build((err, buf) => (err ? reject(err) : resolve(buf))));
  return { raw, messageId };
}

export const addrList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((x) => (typeof x === 'string' ? x.trim() : x?.address))
  .filter(Boolean)
  .map((x) => (/<([^>]+)>/.exec(x)?.[1] ?? x).trim().toLowerCase());
