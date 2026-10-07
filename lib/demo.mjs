// The demo: a fictional team (Acme Dental) with a mailbox for Sam and a command address, all on the
// in-memory mail server. Nothing here touches a real mailbox. Every name and address is made up.
import { MemoryMailServer, MEMORY_AUTHSERV } from './mail/memory.mjs';
import { buildRaw } from './mail/compose.mjs';
import { createEmailApp } from './app.mjs';

export const DEMO = {
  domain: 'acme.example',
  me: 'sam@acme.example',
  commands: 'ops@acme.example',
  members: [
    { name: 'Sam Rivera', email: 'sam@acme.example', github: 'sam-demo', role: 'owner' },
    { name: 'Jordan Lee', email: 'jordan@acme.example', role: 'admin' },
    { name: 'Casey Morgan', email: 'casey@acme.example', role: 'member' },
    { name: 'Riley Chen', email: 'riley@acme.example', role: 'member' },
  ],
};

const H = 3600e3;
// [hours ago, from, name, subject, text, extra]
const MAIL = [
  [1, 'dana@birch-law.example', 'Dana Okafor', 'Lease renewal for the Elm Street office', 'Hi Sam,\n\nThe landlord sent the renewal terms for the Elm Street office. Rent goes up 4% and the term is three years. Can you confirm by Friday whether you want us to push for a two-year term instead?\n\nI have attached their draft.\n\nDana Okafor\nBirch Law', { attachments: [{ filename: 'elm-street-renewal.pdf', content: 'demo' }] }],
  [3, 'jordan@acme.example', 'Jordan Lee', 'Saturday clinic staffing', 'Sam, we are one hygienist short for Saturday. Casey can cover the morning. Could you approve overtime for the afternoon?\n\nJordan', {}],
  [5, 'orders@brightsmile-supply.example', 'BrightSmile Supply', 'Your order #4471 has shipped', 'Your order of 40 boxes of nitrile gloves and 12 packs of prophy paste has shipped. It should arrive Thursday.\n\nTrack it in your account.', { from: 'no-reply@brightsmile-supply.example' }],
  [7, 'news@dentaltoday.example', 'Dental Today', 'This week: five ways to cut no-shows', 'Five ways practices are cutting no-shows this autumn, plus a new survey on patient reminders.\n\nRead online.', { list: true }],
  [9, 'pat@northgate-insurance.example', 'Pat Alvarez', 'Claims portal update', 'Hi Sam,\n\nA quick heads up: our claims portal moves to a new address on November 1. Nothing changes for your logins. No action needed.\n\nPat', { cc: true }],
  [20, 'riley@acme.example', 'Riley Chen', 'New patient forms are live', 'The new intake forms are live on the website. Patients can fill them in before they arrive. I tested it on a phone and it works.\n\nRiley', { cc: true }],
  [26, 'billing@cloudphones.example', 'CloudPhones', 'Invoice for October', 'Your invoice for October is ready: 4 lines, total due 212.40. It will be paid automatically on October 15.', { from: 'billing@cloudphones.example' }],
  [30, 'morgan@harbor-dental-lab.example', 'Morgan Price', 'Crown case for J. Ellis, shade question', 'Hi Sam,\n\nFor the Ellis crown, the impression shows shade A2 but the notes say A3. Which should we use? We need an answer before Wednesday to keep the delivery date.\n\nThanks,\nMorgan\nHarbor Dental Lab', {}],
  [40, 'events@smallbiz-weekly.example', 'Small Business Weekly', 'Webinar invite: hiring in a tight market', 'Join us Thursday for a free webinar on hiring when candidates are scarce.', { list: true }],
  [52, 'casey@acme.example', 'Casey Morgan', 'Sterilizer service visit', 'Sam, the sterilizer service is booked for Tuesday 8am. They need someone to let them in. Can you be there or should I?', {}],
];

export async function seedDemo({ env = { ...process.env, WOS_DEMO: '1' } } = {}) {
  const memory = new MemoryMailServer({ signedDomains: [DEMO.domain, 'birch-law.example'] });
  const app = await createEmailApp({ env: { ...env, WOS_DEMO: '1', TEAM_MEMBERS: '' }, memory, publicUrl: env.PUBLIC_URL || 'https://mail.waronsaas.com' });
  for (const m of DEMO.members) await app.mb.addMember(m);
  await app.mb.setSettings({ team_domains: [DEMO.domain], trusted_authserv: MEMORY_AUTHSERV, digest_tz: 'America/Detroit' });
  const sam = await app.mb.memberByEmail(DEMO.me);
  // Every teammate gets a demo mailbox, so replies from the command address land somewhere.
  for (const m of DEMO.members) memory.box(m.email);
  await app.mb.connectAccount({ kind: 'memory', address: DEMO.me, name: 'Sam Rivera', owner_id: sam.id });
  await app.mb.connectAccount({ kind: 'memory', address: DEMO.commands, name: 'Acme ops', purpose: 'commands' });
  await app.mb.setSettings({ rules: [{ from: '*@dentaltoday.example', triage: 'news' }] });

  const now = Date.now();
  for (const [ago, from, name, subject, text, x] of [...MAIL].reverse()) {
    const sender = x.from ?? from;
    const to = x.cc ? ['team@acme.example'] : [DEMO.me];
    const { raw } = await buildRaw({
      from: { name, address: sender }, to, cc: x.cc ? [DEMO.me] : undefined, subject, text, date: new Date(now - ago * H),
      headers: x.list ? { 'List-Unsubscribe': `<https://${sender.split('@')[1]}/unsubscribe>`, Precedence: 'bulk' } : {},
      attachments: x.attachments,
    });
    memory.deliver(raw, { from: sender, to: [DEMO.me] });
  }
  await app.mb.sync();
  // One reply already in a thread, so threads show a conversation.
  const [lab] = await app.mb.listThreads({ view: 'search', q: 'ellis' });
  if (lab) await app.mb.markRead(lab.id, true);
  return { app, memory };
}
