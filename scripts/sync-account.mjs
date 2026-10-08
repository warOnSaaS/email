// Copies the warOnSaaS Account client library (one file, no dependencies) into lib/account-client.mjs.
// Never edit the copy by hand: fix it in warOnSaaS/account and run this again.
// Usage: node scripts/sync-account.mjs [path-to-account-repo]   (default ../wos-account)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(process.argv[2] ?? path.join(process.env.HOME ?? '..', 'wos-account'));
const src = path.join(repo, 'client', 'account-client.mjs');
const out = path.resolve('lib', 'account-client.mjs');
let rev = 'unknown';
try { rev = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch { /* not a checkout */ }
const body = fs.readFileSync(src, 'utf8');
fs.writeFileSync(out, `// Copied from warOnSaaS/account client/account-client.mjs at ${rev} by scripts/sync-account.mjs. Do not edit.\n${body}`);
console.log(`synced account client ${rev} (${body.length} bytes) into lib/account-client.mjs`);
