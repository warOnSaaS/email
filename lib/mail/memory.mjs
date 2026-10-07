// An in-memory mail server: mailboxes keyed by address, with INBOX, Archive, Trash and Sent.
// The demo and the fast tests use it in place of IMAP and SMTP. It speaks the same transport interface
// as lib/mail/imap.mjs, and it stamps an Authentication-Results header the way a real receiving
// server does, so the run-by-email checks run unchanged against it.
import { buildRaw, addrList, domainOf } from './compose.mjs';

export const MEMORY_AUTHSERV = 'memory.wos.local';

export class MemoryMailServer {
  constructor({ signedDomains = [] } = {}) {
    // Domains whose mail this fake world treats as properly signed (SPF, DKIM and DMARC pass).
    this.signedDomains = new Set(signedDomains.map((d) => d.toLowerCase()));
    this.boxes = new Map();
    this.outside = []; // mail addressed to nobody in this world, kept so tests and the demo can show it
    this.uid = 1;
  }

  box(address) {
    const a = String(address).toLowerCase();
    // Plus addressing, as Gmail and Fastmail do: ops+anything@ lands in ops@.
    const base = a.replace(/\+[^@]*@/, '@');
    if (!this.boxes.has(base)) this.boxes.set(base, { INBOX: [], Archive: [], Trash: [], Sent: [] });
    return this.boxes.get(base);
  }

  has(address) { return this.boxes.has(String(address).toLowerCase().replace(/\+[^@]*@/, '@')); }

  // Deliver bytes to every recipient this world knows, stamping trace and auth headers first.
  deliver(raw, { from, to, auth }) {
    const fromDomain = domainOf(from);
    const verdict = auth ?? (this.signedDomains.has(fromDomain) ? 'pass' : 'fail');
    const stamp = `Received: from mail.${fromDomain} (mail.${fromDomain} [127.0.0.1]) by ${MEMORY_AUTHSERV}; ${new Date().toUTCString()}\r\n` +
      `Authentication-Results: ${MEMORY_AUTHSERV}; spf=${verdict} smtp.mailfrom=${from}; dkim=${verdict} header.d=${fromDomain}; dmarc=${verdict} header.from=${fromDomain}\r\n`;
    const bytes = Buffer.concat([Buffer.from(stamp), Buffer.from(raw)]);
    let delivered = 0;
    for (const rcpt of to) {
      if (!this.has(rcpt)) { this.outside.push({ to: rcpt, raw: bytes }); continue; }
      this.box(rcpt).INBOX.push({ uid: this.uid++, raw: bytes, flags: new Set() });
      delivered++;
    }
    return delivered;
  }

  transport(address) { return new MemoryTransport(this, address); }
}

export class MemoryTransport {
  constructor(server, address) { this.server = server; this.address = address.toLowerCase(); }
  async verify() { this.server.box(this.address); return { ok: true }; }

  async fetchNew(state = {}) {
    const inbox = this.server.box(this.address).INBOX;
    const last = state.lastUid ?? 0;
    const messages = inbox.filter((m) => m.uid > last).map((m) => ({ uid: m.uid, raw: m.raw, seen: m.flags.has('\\Seen'), folder: 'INBOX' }));
    return { messages, state: { ...state, lastUid: Math.max(last, ...inbox.map((m) => m.uid), 0) } };
  }

  async send(msg) {
    const { raw, messageId } = await buildRaw(msg);
    const rcpts = [...addrList(msg.to), ...addrList(msg.cc), ...addrList(msg.bcc)];
    this.server.box(this.address).Sent.push({ uid: this.server.uid++, raw, flags: new Set(['\\Seen']) });
    this.server.deliver(raw, { from: this.address, to: rcpts });
    return { messageId, raw };
  }

  #move(uid, from, to) {
    const b = this.server.box(this.address);
    const i = b[from].findIndex((m) => m.uid === uid);
    if (i < 0) return false;
    b[to].push(...b[from].splice(i, 1));
    return true;
  }

  async archive({ uid }) { return this.#move(uid, 'INBOX', 'Archive'); }
  async unarchive({ uid }) { return this.#move(uid, 'Archive', 'INBOX'); }
  async trash({ uid }) { return this.#move(uid, 'INBOX', 'Trash') || this.#move(uid, 'Archive', 'Trash'); }
  async markSeen({ uid }) { for (const f of ['INBOX', 'Archive']) for (const m of this.server.box(this.address)[f]) if (m.uid === uid) m.flags.add('\\Seen'); return true; }
  async close() {}
}
