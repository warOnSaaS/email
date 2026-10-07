// Screenshots of every screen at desk and phone widths, light and dark, into .shots/ (git-ignored).
//   npm run shots            against a fresh demo server
//   npm run shots -- <url>   against a running server (e.g. the Vercel deployment)
//   ONLY=inbox,thread npm run shots
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { start } from '../server.mjs';

const out = path.resolve('.shots');
fs.mkdirSync(out, { recursive: true });
let base = process.argv[2], srv;
if (!base) { const s = await start({ demo: true, port: 0, timers: false }); srv = s.srv; base = s.url; }

const firstThread = async (p, q) => { await p.goto(`${base}/search?q=${q}`); return p.locator('[data-row]').first().getAttribute('data-href'); };
const shots = [
  ['inbox', '/'],
  ['inbox-all', '/inbox/all'],
  ['thread', async (p) => firstThread(p, 'lease')],
  ['thread-ai-draft', async (p) => firstThread(p, 'ellis'), async (p) => { await p.fill('[data-reply]', 'use A2, matching the impression'); await p.click('#reply [data-ai]'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(400); }],
  ['compose', '/', async (p) => { await p.keyboard.press('c'); await p.waitForTimeout(300); }],
  ['shortcuts', '/', async (p) => { await p.keyboard.press('?'); await p.waitForTimeout(300); }],
  ['approvals', '/approvals'],
  ['by-email', '/by-email'],
  ['settings', '/settings'],
  ['search', '/search?q=invoice'],
];

const browser = await chromium.launch();
const only = process.env.ONLY?.split(',');
const problems = [];
for (const [w, h, tag] of [[1440, 900, 'desk'], [390, 844, 'phone']]) {
  for (const mode of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'phone' ? 2 : 1, colorScheme: mode });
    for (const [name, url, act] of shots) {
      if (only && !only.includes(name)) continue;
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      const target = typeof url === 'function' ? await url(p) : url;
      await p.goto(base + target, { waitUntil: 'networkidle' });
      await p.evaluate(() => document.fonts.ready);
      if (act) await act(p);
      await p.waitForTimeout(200);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) problems.push(`${name}-${tag}-${mode}: ${over}px wider than the screen`);
      await p.screenshot({ path: path.join(out, `${name}-${tag}-${mode}.png`), fullPage: !['compose', 'shortcuts'].includes(name) });
      if (errors.length) problems.push(`${name}-${tag}-${mode}: ${errors.join(' | ')}`);
      await p.close();
    }
    await ctx.close();
  }
}
await browser.close();
srv?.close();
console.log(problems.length ? problems.join('\n') : 'no overflow, no console errors');
console.log(`screenshots in ${out}`);
