// Copies the warOnSaaS UI kit (ui-design) into public/ui from the kit repo's main branch, whatever branch
// the kit's working copy has checked out. Never edit public/ui by hand: what the kit lacks is built in
// public/app/email.css with the kit's tokens only.
// Usage: node scripts/sync-kit.mjs [path-to-ui-design] [branch]   (defaults ../waronsaas-ui-design main)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const kit = path.resolve(process.argv[2] ?? path.join(process.env.HOME ?? '..', 'waronsaas-ui-design'));
const branch = process.argv[3] ?? 'main';
const git = (...a) => execFileSync('git', ['-C', kit, ...a], { maxBuffer: 64 << 20 });
const tracked = git('ls-tree', '-r', '--name-only', branch).toString().split('\n').filter(Boolean);
const want = (f) => /^(src\/(ui\.css|tokens\.css|render\.mjs|ui\.mjs)|themes\/.+\.css|fonts\/.+\.(woff2|txt)|NOTICE|LICENSE)$/.test(f);
const files = tracked.filter(want);
const out = path.resolve('public', 'ui');
fs.rmSync(out, { recursive: true, force: true });
let bytes = 0;
for (const f of files) {
  const to = path.join(out, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const buf = git('show', `${branch}:${f}`);
  fs.writeFileSync(to, buf);
  bytes += buf.length;
}
const rev = git('rev-parse', '--short', branch).toString().trim();
fs.writeFileSync(path.join(out, 'SYNCED.txt'), `Copied from warOnSaaS/ui-design ${branch} at ${rev} by scripts/sync-kit.mjs. Do not edit.\n`);
console.log(`synced ui-design ${branch} ${rev} (${files.length} files, ${bytes} bytes) into public/ui`);
