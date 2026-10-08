// Checks the hosted copy's sign-in with a real browser, against the live site by default:
//   node scripts/verify-account.mjs [https://mail.waronsaas.com]
// Signed out: the main pages render at 1440 and 390 and a press on an action shows the prompt.
// Signed in: a throwaway inbox signs in at the account (email link), the app then signs in silently and
// an action works. Then a fresh browser signs in again and the change must still be there (the space is
// durable). Screenshots land in .shots/account-*.png. The test account is deleted at the end.
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
const seenLinks = new Set();
// Signs in at the account with the throwaway inbox (a fresh link each time), then opens the app, which
// must sign in silently. Returns the page.
async function accountSignIn(ctx, label) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // Ask for the link from inside the browser context, so the account's cookies land in this browser.
  await page.goto(ACCOUNT + '/', { waitUntil: 'networkidle' });
  const asked = await ctx.request.post(ACCOUNT + '/auth/email', { form: { email: box.address, next: '/' } });
  note(asked.status() === 200, `${label}: asked for a sign-in link (${asked.status()})`);
  let link = null;
  for (let i = 0; i < 40 && !link; i++) {
    const mail = await box.waitFor(/Sign in/i);
    for (const m of mail.text.matchAll(/(https:\/\/\S+\/auth\/email\/verify\?t=[^\s"<]+)/g)) if (!seenLinks.has(m[1])) link = m[1];
    if (!link) await new Promise((r) => setTimeout(r, 3000));
  }
  note(!!link, `${label}: a new sign-in link arrived`);
  seenLinks.add(link);
  await page.goto(link, { waitUntil: 'networkidle' });
  await page.locator('form button').first().click();
  await page.waitForLoadState('networkidle');
  // A new account is asked its name once before it goes on.
  const nameBox = page.locator('input[name="name"][autofocus]');
  if (await nameBox.count()) {
    await nameBox.fill('Test Person');
    await Promise.all([page.waitForLoadState('networkidle'), nameBox.press('Enter')]);
    await page.waitForTimeout(500);
    note(true, `${label}: gave the account a name`);
  }
  note(/account\.waronsaas\.com/.test(page.url()), `${label}: signed in at the account`);
  await page.goto(base + '/');
  await page.waitForFunction(() => document.querySelector('script[src$="/prompt.js"]')?.dataset.signedIn === 'true', null, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  note(await page.locator('script[src$="/prompt.js"][data-signed-in="true"]').count() === 1, `${label}: the app signed in silently`);
  return page;
}
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await accountSignIn(ctx, 'first browser');
note(await page.locator('.ui-side-me a[href="/logout"]').count() === 1, 'app: the side rail shows Sign out');
await shot(page, 'in-inbox-desk');
// An action works: archive the first conversation from the screen.
const before = await page.locator('[data-row]').count();
const archivedSubject = (await page.locator('[data-row] .subject, [data-row] b').first().textContent().catch(() => ''))?.trim();
const archivedHref = await page.locator('[data-row]').first().getAttribute('data-href');
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

await ctx.close();

// A fresh browser, the same account: the archive must still be there.
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page2 = await accountSignIn(ctx2, 'second browser');
const rows2 = await page2.locator('[data-row]').count();
const hrefs2 = await page2.locator('[data-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-href')));
note(rows2 === after && !hrefs2.includes(archivedHref), `durable: the archive persisted across sign-ins (${rows2} rows, archived one absent)`);
await page2.goto(base + '/inbox/archived', { waitUntil: 'networkidle' });
const archivedHrefs = await page2.locator('[data-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-href')));
note(archivedHrefs.includes(archivedHref), `durable: the archived conversation is in Archived${archivedSubject ? ` (${archivedSubject})` : ''}`);
await shot(page2, 'in-archived-desk');
// Delete the account at account.waronsaas.com: the back channel must end the Email session at once.
const del = await ctx2.request.post(ACCOUNT + '/api/tools/account.delete', { headers: { 'x-wos-call': '1', 'content-type': 'application/json' }, data: { confirm: 'delete' } });
note(del.ok(), `account: test account deleted (${del.status()})`);
const afterDel = await ctx2.request.post(base + '/api/tools/email.list_members', { headers: { 'x-requested-with': 'wos-email', 'content-type': 'application/json' }, data: {} });
note(afterDel.status() === 401, `back channel: the Email cookie is refused at once after the deletion (${afterDel.status()})`);
await page2.goto(base + '/', { waitUntil: 'networkidle' });
note(await page2.locator('script[src$="/prompt.js"][data-signed-in="false"]').count() === 1, 'back channel: the page opens signed out');
await ctx2.close();
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join('\n')}` : '\nall good');
console.log(`screenshots in ${out}/account-*.png`);
process.exit(problems.length ? 1 : 0);
