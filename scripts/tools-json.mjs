// Writes tools.json (the ROADMAP 3.1 catalogue) from lib/tools.mjs. With --check, fails when the file is stale.
import fs from 'node:fs';
import { catalogue } from '../lib/tools.mjs';

const text = `${JSON.stringify(await catalogue(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  const have = fs.existsSync('tools.json') ? fs.readFileSync('tools.json', 'utf8') : '';
  if (have !== text) { console.error('tools.json is out of date: run npm run tools:json'); process.exit(1); }
  console.log('tools.json is current');
} else {
  fs.writeFileSync('tools.json', text);
  console.log(`wrote tools.json (${JSON.parse(text).tools.length} tools)`);
}
