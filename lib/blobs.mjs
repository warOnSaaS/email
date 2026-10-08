// Message bodies live in file storage, not the database, to keep Postgres small (ROADMAP 5.4, data model).
//   FILES_DIR set   a folder on disk (the docker-compose volume)
//   otherwise       memory (the demo and tests)
//   dbBlobs(db)     the database itself, for hosted spaces that have Postgres but no disk
import fs from 'node:fs';
import path from 'node:path';

export function openBlobs(dir = process.env.FILES_DIR) {
  if (!dir) {
    const m = new Map();
    return { kind: 'memory', async put(k, v) { m.set(k, v); }, async get(k) { return m.get(k) ?? null; }, async del(k) { m.delete(k); } };
  }
  const root = path.resolve(dir, 'bodies');
  fs.mkdirSync(root, { recursive: true });
  const file = (k) => path.join(root, `${String(k).replace(/[^a-z0-9_-]/gi, '_')}.json`);
  return {
    kind: 'disk',
    async put(k, v) { fs.writeFileSync(file(k), JSON.stringify(v)); },
    async get(k) { try { return JSON.parse(fs.readFileSync(file(k), 'utf8')); } catch { return null; } },
    async del(k) { fs.rmSync(file(k), { force: true }); },
  };
}

// Bodies in the database (migrations/0003_blobs.sql). Same SQL on SQLite and Postgres.
export function dbBlobs(db) {
  return {
    kind: 'db',
    async put(k, v) { await db.run('INSERT INTO email_blobs (key, value, created_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [String(k), JSON.stringify(v), new Date().toISOString()]); },
    async get(k) { const r = await db.get('SELECT value FROM email_blobs WHERE key = ?', [String(k)]); try { return r ? JSON.parse(r.value) : null; } catch { return null; } },
    async del(k) { await db.run('DELETE FROM email_blobs WHERE key = ?', [String(k)]); },
  };
}
