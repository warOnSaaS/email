// Message bodies live in file storage, not the database, to keep Postgres small (ROADMAP 5.4, data model).
//   FILES_DIR set   a folder on disk (the docker-compose volume)
//   otherwise       memory (the demo and tests)
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
