// Checks the hosted copy's sign-in with a real browser, against the live site by default:
//   node scripts/verify-account.mjs [https://mail.waronsaas.com]
// Signed out: the main pages render at 1440 and 390 and a press on an action shows the prompt.
// Signed in: a throwaway inbox signs in at the account (email link), the app then signs in silently and
// an action works. Screenshots land in .shots/account-*.png. The test account is deleted at the end.
// Never emails a real person: the inbox is a mail.tm throwaway.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'https://mail.waronsaas.com').replace(/\/$/, '');
const ACCOUNT = process.env.WOS_ACCOUNT_URL || 'https://account.waronsaas.com';
const out = path.resolve('.shots');
fs.mkdirSync(out, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(out, `account-${name}.png`), fullPage: false });
const sizes = [['desk', 1440, 900, 1], ['phone', 390, 844, 2]];
const problems = [];
const note = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems.push(what); };

const browser = await chromium.launch({ args: ['--mute-audio'] });

// ---------- signed out ----------
for (const [tag, width, height, scale] of sizes) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, p] of [['inbox', '/'], ['settings', '/settings']]) {
    const r = await page.goto(base + p, { waitUntil: 'networkidle' });
    note(r.status() === 200 && new URL(page.url()).pathname === p, `signed out ${p} at ${width}: 200, no redirect`);
    note(await page.locator('script[src$="/prompt.js"][data-signed-in="false"]').count() === 1, `signed out ${p} at ${width}: prompt script present`);
    await shot(page, `out-${name}-${tag}`);
  }
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.locator('button[data-tool="email.sync"]').first().click();
  const prompt = page.locator('.wos-ap');
  await prompt.waitFor({ timeout: 5000 }).catch(() => {});
  note(await prompt.count() === 1, `signed out press on an action at ${width}: shows the sign-in prompt`);
  note(/Sign in to/.test(await prompt.locator('h2').textContent().catch(() => '')), `prompt at ${width} says "Sign in to ..."`);
  await shot(page, `out-prompt-${tag}`);
  note(errors.length === 0, `signed out at ${width}: no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await ctx.close();
}

// ---------- signed in ----------
const { Mailbox } = await import(path.join(os.homedir(), 'wos-account', 'scripts', 'mailbox.mjs'));
const box = await Mailbox.create();
console.log(`throwaway inbox ${box.address}`);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Ask for the link from inside the browser context, so the account's cookies land in this browser.
await page.goto(ACCOUNT + '/', { waitUntil: 'networkidle' });
const asked = await ctx.request.post(ACCOUNT + '/auth/email', { form: { email: box.address, next: '/' } });
note(asked.status() === 200, `account: asked for a sign-in link (${asked.status()})`);
const mail = await box.waitFor(/Sign in/i);
const link = /(https:\/\/\S+\/auth\/email\/verify\?t=[^\s"<]+)/.exec(mail.text)?.[1];
note(!!link, 'account: the sign-in link arrived');
await page.goto(link, { waitUntil: 'networkidle' });
await page.locator('form button').first().click();
await page.waitForLoadState('networkidle');
note(/account\.waronsaas\.com/.test(page.url()), `account: signed in, now at ${page.url()}`);

// The app: silent sign-in, no clicks.
await page.goto(base + '/');
await page.waitForFunction(() => document.querySelector('script[src$="/prompt.js"]')?.dataset.signedIn === 'true', null, { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle');
const signedIn = await page.locator('script[src$="/prompt.js"][data-signed-in="true"]').count() === 1;
note(signedIn, 'app: signed in silently after the account sign-in');
note(await page.locator('.ui-side-me a[href="/logout"]').count() === 1, 'app: the side rail shows Sign out');
await shot(page, 'in-inbox-desk');
// An action works: archive the first conversation from the screen.
const before = await page.locator('[data-row]').count();
await page.locator('[data-row] button[data-tool="email.archive"]').first().click({ force: true });
await page.waitForTimeout(1200);
const after = await page.locator('[data-row]').count();
note(after === before - 1, `app: archive from the screen worked (${before} -> ${after} rows)`);
const rest = await ctx.request.post(base + '/api/tools/email.list_members', { headers: { 'x-requested-with': 'wos-email', 'content-type': 'application/json' }, data: {} });
const members = rest.ok() ? (await rest.json()).result.members : [];
note(rest.status() === 200 && members.some((m) => m.email === box.address), `app: REST with the session works and the account is a member (${rest.status()})`);
await shot(page, 'in-settings-desk').catch(() => {});
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await shot(page, 'in-inbox-phone');
await page.goto(base + '/settings', { waitUntil: 'networkidle' });
await shot(page, 'in-settings-phone');
note(errors.length === 0, `signed in: no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);

// Clean up: delete the test account.
const del = await ctx.request.post(ACCOUNT + '/api/tools/account.delete', { headers: { 'x-wos-call': '1', 'content-type': 'application/json' }, data: { confirm: 'delete' } });
note(del.ok(), `account: test account deleted (${del.status()})`);
await ctx.close();
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join('\n')}` : '\nall good');
console.log(`screenshots in ${out}/account-*.png`);
process.exit(problems.length ? 1 : 0);
