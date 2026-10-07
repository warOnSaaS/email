// Fails if a private name (from the git-ignored .names file or instances/*.names) appears in a tracked file.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sources = ['.names', ...(fs.existsSync('instances') ? fs.readdirSync('instances').filter((f) => f.endsWith('.names')).map((f) => path.join('instances', f)) : [])].filter((f) => fs.existsSync(f));
const names = sources.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
if (!names.length) { console.log('check:clean: no .names file, nothing to check'); process.exit(0); }
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const hits = [];
for (const f of files) {
  if (!fs.existsSync(f) || fs.lstatSync(f).isSymbolicLink() || /\.(woff2|png)$/.test(f)) continue;
  const text = fs.readFileSync(f, 'utf8').toLowerCase();
  for (const n of names) if (text.includes(n.toLowerCase())) hits.push(`${f}: "${n}"`);
}
if (hits.length) { console.error(`check:clean: private names in tracked files:\n  ${hits.join('\n  ')}`); process.exit(1); }
console.log(`check:clean: ${files.length} files clean of ${names.length} names`);
