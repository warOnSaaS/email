// Sign-outs heard from the account ("Sign out everywhere", account deleted) through the back-channel route.
// A token or cookie for that account issued at or before the sign-out is dead at once, on every server:
// the moment is kept in the install's database when there is one, and in memory on this server always.
export class Signouts {
  constructor(getDb = async () => null) { this.getDb = getDb; this.cache = new Map(); }

  // Everything issued up to now for this account is over.
  async mark(sub, { deleted = false } = {}) {
    const at = Math.floor(Date.now() / 1000);
    this.cache.set(sub, { at, until: Infinity });
    const db = await this.getDb();
    if (db) await db.run('INSERT INTO email_signouts (sub, at, deleted) VALUES (?, ?, ?) ON CONFLICT (sub) DO UPDATE SET at = excluded.at, deleted = excluded.deleted', [sub, at, deleted ? 1 : 0]);
    return at;
  }

  // The moment of the last sign-out for this account, or 0. A miss is asked of the database again after 5s.
  async at(sub) {
    const hit = this.cache.get(sub);
    if (hit && hit.until > Date.now()) return hit.at;
    const db = await this.getDb();
    const row = db ? await db.get('SELECT at FROM email_signouts WHERE sub = ?', [sub]) : null;
    const at = row ? Number(row.at) : 0;
    this.cache.set(sub, { at, until: Date.now() + (at ? 3600_000 : 5_000) });
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value);
    return at;
  }

  // Is this token or cookie (its claims) dead? Tokens without an issue time are treated as old.
  async dead(claims) {
    if (!claims?.sub) return false;
    const at = await this.at(claims.sub);
    return !!at && (!claims.iat || claims.iat <= at);
  }
}
