// Storage: any Postgres through DATABASE_URL, or a SQLite file (or memory) when there is none.
// SQL in this app is written once, with ? placeholders, in the shared subset both databases speak.
// Database updates (migrations/*.sql) apply themselves when the app starts.
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(new URL('../migrations', import.meta.url).pathname);

export async function openDb({ url = process.env.DATABASE_URL, file = process.env.SQLITE_FILE } = {}) {
  const db = url && /^postgres(ql)?:/.test(url) ? await postgres(url) : await sqlite(file ?? ':memory:');
  await migrate(db);
  return db;
}

async function sqlite(file) {
  const { default: Database } = await import('better-sqlite3');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const raw = new Database(file);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const fix = (params) => params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  return {
    kind: 'sqlite',
    async all(sql, params = []) { return raw.prepare(sql).all(...fix(params)); },
    async get(sql, params = []) { return raw.prepare(sql).get(...fix(params)) ?? null; },
    async run(sql, params = []) { const r = raw.prepare(sql).run(...fix(params)); return { changes: r.changes }; },
    async exec(sql) { raw.exec(sql); },
    async tx(fn) { raw.exec('BEGIN'); try { const out = await fn(); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
    async close() { raw.close(); },
  };
}

async function postgres(url) {
  const { default: pg } = await import('pg');
  // BIGINT columns hold epoch milliseconds; read them back as numbers, not strings.
  pg.types.setTypeParser(20, (v) => Number(v));
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL || 5), ssl: /sslmode=require|neon\.tech|supabase/.test(url) ? { rejectUnauthorized: false } : undefined });
  const num = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const q = (sql, params = []) => pool.query(num(sql), params.map((v) => (v === undefined ? null : v)));
  return {
    kind: 'postgres',
    async all(sql, params) { return (await q(sql, params)).rows; },
    async get(sql, params) { return (await q(sql, params)).rows[0] ?? null; },
    async run(sql, params) { return { changes: (await q(sql, params)).rowCount }; },
    async exec(sql) { await pool.query(sql); },
    // One pool, small apps: a transaction is a best effort here (each statement is its own call).
    async tx(fn) { return fn(); },
    async close() { await pool.end(); },
  };
}

export async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS email_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)');
  const done = new Set((await db.all('SELECT name FROM email_migrations')).map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.exec(stmt);
    await db.run('INSERT INTO email_migrations (name, applied_at) VALUES (?, ?)', [f, Date.now()]);
  }
}
