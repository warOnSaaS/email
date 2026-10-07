// Any mailbox by IMAP (reading) and SMTP (sending): Fastmail, iCloud, a self-hosted server, or Gmail and
// Outlook with an app password. imapflow and nodemailer do the protocol work.
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { buildRaw, addrList } from './compose.mjs';

const INITIAL = () => Number(process.env.SYNC_INITIAL || 200);

export class ImapTransport {
  // auth: { imap: { host, port, secure, user, pass }, smtp: { host, port, secure, user, pass } }
  constructor(address, auth) { this.address = address; this.auth = auth; }

  #client() {
    const i = this.auth.imap;
    return new ImapFlow({
      host: i.host, port: Number(i.port || 993), secure: i.secure !== false && Number(i.port || 993) === 993 ? true : !!i.secure,
      auth: { user: i.user || this.address, pass: i.pass }, logger: false,
      tls: { rejectUnauthorized: !i.insecure },
    });
  }

  async #with(fn) {
    const c = this.#client();
    await c.connect();
    try { return await fn(c); } finally { await c.logout().catch(() => {}); }
  }

  #smtp() {
    const s = this.auth.smtp;
    return nodemailer.createTransport({
      host: s.host, port: Number(s.port || 465), secure: s.secure ?? Number(s.port || 465) === 465,
      auth: s.pass ? { user: s.user || this.address, pass: s.pass } : undefined,
      tls: { rejectUnauthorized: !s.insecure },
    });
  }

  async verify() {
    await this.#with(async (c) => c.status('INBOX', { messages: true }));
    await this.#smtp().verify();
    return { ok: true };
  }

  async fetchNew(state = {}) {
    return this.#with(async (c) => {
      const lock = await c.getMailboxLock('INBOX');
      try {
        const box = c.mailbox;
        const validity = String(box.uidValidity);
        let last = state.uidValidity === validity ? state.lastUid ?? 0 : 0;
        let range;
        if (!last) {
          const total = box.exists;
          if (!total) return { messages: [], state: { uidValidity: validity, lastUid: 0 } };
          range = { seq: `${Math.max(1, total - INITIAL() + 1)}:*` };
        } else range = { uid: `${last + 1}:*` };
        const messages = [];
        const q = range.uid ? range.uid : range.seq;
        for await (const m of c.fetch(q, { uid: true, source: true, flags: true }, { uid: !!range.uid })) {
          if (m.uid <= last) continue;
          messages.push({ uid: m.uid, raw: m.source, seen: m.flags?.has('\\Seen') ?? false, folder: 'INBOX' });
        }
        const top = Math.max(last, ...messages.map((m) => m.uid));
        return { messages, state: { uidValidity: validity, lastUid: top } };
      } finally { lock.release(); }
    });
  }

  async send(msg) {
    const { raw, messageId } = await buildRaw(msg);
    const to = [...addrList(msg.to), ...addrList(msg.cc), ...addrList(msg.bcc)];
    await this.#smtp().sendMail({ envelope: { from: this.address, to }, raw });
    return { messageId, raw };
  }

  async #folder(c, use, fallback) {
    const list = await c.list();
    const hit = list.find((f) => f.specialUse === use) ?? list.find((f) => f.path.toLowerCase() === fallback.toLowerCase());
    if (hit) return hit.path;
    await c.mailboxCreate(fallback).catch(() => {});
    return fallback;
  }

  // Find a message by its Message-ID header in a folder, because UIDs change when a message moves.
  async #locate(c, folder, messageId) {
    const lock = await c.getMailboxLock(folder);
    try {
      const uids = await c.search({ header: { 'message-id': messageId } }, { uid: true });
      return uids?.length ? uids : [];
    } finally { lock.release(); }
  }

  async #move(fromUse, fromName, toUse, toName, messageId) {
    return this.#with(async (c) => {
      const from = fromName === 'INBOX' ? 'INBOX' : await this.#folder(c, fromUse, fromName);
      const to = toName === 'INBOX' ? 'INBOX' : await this.#folder(c, toUse, toName);
      const uids = await this.#locate(c, from, messageId);
      if (!uids.length) return false;
      const lock = await c.getMailboxLock(from);
      try { await c.messageMove(uids, to, { uid: true }); } finally { lock.release(); }
      return true;
    });
  }

  async archive({ messageId }) { return this.#move(null, 'INBOX', '\\Archive', 'Archive', messageId); }
  async unarchive({ messageId }) { return this.#move('\\Archive', 'Archive', null, 'INBOX', messageId); }
  async trash({ messageId }) {
    return (await this.#move(null, 'INBOX', '\\Trash', 'Trash', messageId)) || this.#move('\\Archive', 'Archive', '\\Trash', 'Trash', messageId);
  }
  async markSeen({ messageId }) {
    return this.#with(async (c) => {
      const uids = await this.#locate(c, 'INBOX', messageId);
      if (!uids.length) return false;
      const lock = await c.getMailboxLock('INBOX');
      try { await c.messageFlagsAdd(uids, ['\\Seen'], { uid: true }); } finally { lock.release(); }
      return true;
    });
  }
  async close() {}
}
