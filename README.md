# wOS Email

Fast email for small teams, and the address your team runs wOS from.

- **Your own mailbox, a better inbox.** Connect any mailbox (Fastmail, iCloud, your own server, or Gmail and Outlook with an app password). Threads, search, reply, compose and archive, all from the keyboard.
- **Sorted for you.** Mail lands in **Needs you**, **FYI** or **Newsletters**. Your own rules come first.
- **Drafts by AI, sent by you.** Ask for a reply in a few words. The AI writes it; you press Send.
- **Run wOS by email.** Your team writes to one address, like `ops@your-team.example`. Verified teammates can search, archive, draft, answer alerts and more, all by email.
- **Agents welcome, with a person's yes.** Everything on screen is also a tool for Claude, ChatGPT or any MCP client. Sending outside the team and deleting wait for a person.

Live demo with a made-up mailbox: **https://mail.waronsaas.com**. It runs on a mail server that lives in memory; nothing reaches a real inbox.

## Host it yourself, free

Open source under AGPL-3.0. You need a server that stays on (a small VPS is plenty), Docker, and a mailbox.

```
git clone https://github.com/warOnSaaS/email && cd email
cp .env.example .env        # fill in EMAIL_SECRET_KEY, OAUTH_SECRET, PUBLIC_URL, TEAM_MEMBERS
docker compose up -d        # the app and Postgres on http://localhost:3990
```

Want to try it with no real mailbox at all? Add the test mail server:

```
docker compose --profile testmail up -d
```

Then connect mailboxes in Settings with server `greenmail`, IMAP port `3143`, SMTP port `3025`, any password.

| What you need | Why | Free option |
|---|---|---|
| A server that stays on | Mail is checked every minute and the command address every 30 seconds | Any VPS, a home server, your laptop for a trial |
| A database | Everything except message bodies | The Postgres in `docker-compose.yml`, any Postgres through `DATABASE_URL`, or a SQLite file when `DATABASE_URL` is empty |
| A mailbox per person | We are a client, not a mail host | The mailbox you already have (IMAP and SMTP) |
| One mailbox for the team command address | Running wOS by email | A spare address at your domain, like `ops@` |
| HTTPS and a domain | Sign-in and signed links | Caddy or your host's certificates |
| Sign-in | GitHub, or an email link | A GitHub OAuth app (free), or any SMTP account for links |
| An AI model (optional) | AI sorting and drafts | Ollama or any OpenAI-compatible server; without one, rules sort and drafts start from a plain template |

Database updates apply themselves when the app starts. **Export everything** is a button in Settings (and the `email.export` tool).

## Running wOS by email

| You send | What happens |
|---|---|
| Any text to `ops@your-team.example` | The default agent (here, the email app) does it and replies in the same thread. Send `help` for what works. |
| Mail to `ops+crm@...`, or a subject starting `crm:` | Goes to that app's tools only. Apps register themselves (see "For the suite core" below). |
| A reply to an alert: `yes`, `no`, `2` | Answers it. The reply address carries a signed, one-time token issued to you alone. |
| A request to delete, or to email someone outside the team | Never done from a reply. You get a signed link that opens a page with a button. Opening the link does nothing; pressing the button does it, once. |
| Nothing | A daily digest arrives at the hour you choose: what needs you, what waits for your yes, what came in by email. |

**Who is believed.** Only team members, and only when their mail passes SPF, DKIM and DMARC (the strict default; "DMARC only" is a setting for teams whose mail is forwarded). The app trusts the `Authentication-Results` header your mail provider adds, if you name that server in Settings, and only the topmost one. Otherwise it checks the signatures itself with [mailauth](https://github.com/postalsys/mailauth). Mail from anyone else is logged and never answered, so the address cannot be used to send spam.

## Safety with AI and agents

| Risk | What this app does |
|---|---|
| An email tells the AI to do something | Outside mail reaches the model only inside `<untrusted_email>` tags, with any copy of the tag removed, and the model is told it is data. The model here has no tools: it only writes text. |
| An agent sends mail to a stranger | `email.send` is `confirm: human`. From an agent, outside sends become an approval request. Only a person approves: in the app, by a signed link, or (for non-destructive asks) by replying to the approval email. |
| An agent deletes mail | `email.delete_thread` and `email.disconnect_account` wait for a person the same way. |
| An agent turns the check off | Only a person in the app can turn off "agents need my yes to email outside the team". |
| A stolen database | Mailbox passwords are encrypted with AES-256-GCM using `EMAIL_SECRET_KEY`, which lives outside the database. Passwords are never sent back to any screen or tool. |
| A teammate reads your mail | Mailboxes are personal. Tools reach only the signed-in person's own mailbox. |
| Every action | Written to an audit log with who, which tool, through which door (web, MCP, REST, email, link). |

## For agents: MCP and REST

Every action on every screen is a tool. The screens call the same tools at `/api/tools/<name>`. Agents connect to `/mcp` (Streamable HTTP, with OAuth sign-in through GitHub). The catalogue is at [`/tools.json`](tools.json) and the app manifest at [`/wos-app.json`](wos-app.json).

| Tool | Scope | Needs a person |
|---|---|---|
| `email.list_threads`, `email.search`, `email.read_thread`, `email.list_drafts` | read | |
| `email.list_accounts`, `email.list_approvals`, `email.list_commands`, `email.list_alerts`, `email.get_settings`, `email.list_members`, `email.export` | read | |
| `email.sync`, `email.archive`, `email.mark_read`, `email.label`, `email.snooze`, `email.triage`, `email.draft`, `email.set_rules` | write | |
| `email.send` | write | for anyone outside the team |
| `email.decide_approval` | write | approving is for people only |
| `email.poll_commands`, `email.send_alert`, `email.send_digest` | write | |
| `email.connect_account`, `email.update_settings`, `email.add_member`, `email.remove_member` | admin | |
| `email.discard_draft` | delete | |
| `email.delete_thread`, `email.disconnect_account` | delete | yes |

Keyboard (press `?` in the app): `j` `k` move, `Enter` open, `e` archive, `h` snooze, `u` unread, `#` delete, `1` `2` `3` sort, `l` label, `r` reply, `d` AI draft, `⌘ Enter` send, `c` compose, `/` search, `s` check mail, `g` then `i` `f` `n` `a` `d` `y` to jump. Each key runs the same tool an agent would.

## For the suite core

This folder follows the suite's app contract ([CONTRACTS.md](https://github.com/warOnSaaS/suite), `packages/manifest` and `packages/tools`): `wos-app.json`, `tools.json` (with input and output schemas and a test per tool), `migrations/0001_init.sql` (portable SQL, every table starts with `email_`), `server.mjs` (`register(ctx)` with one handler per tool, `routes` for signed links under `/hooks/email/act/`, `start`, `stop`, `exportTeam`) and `dist/screens.mjs` (`mount(el, ctx)`, built from `screens/index.mjs` with `npm run build:screens`). `standalone.mjs` runs the same code on its own.

Kit gaps (styles the app adds in `public/app/email.css` until the kit has them): inbox row hover actions, a mail message card, a sticky thread action bar, a reply box, sign-in check chips (SPF, DKIM, DMARC), the compose sheet on phones.

Run by email as a library, for the core's own use:

```js
import { createEmailApp } from '@waronsaas/email';

const app = await createEmailApp();            // DATABASE_URL or SQLite, migrations run here
app.rbe.registerApp('crm', {                   // mail to ops+crm@ or "crm: ..." reaches these tools only
  describe: 'Contacts and deals',
  tools: [{ name: 'crm.find', description: 'Find records', confirm: 'none' }],
  call: (name, input, { actor }) => crm.callTool(name, input, actor),
});
app.rbe.onAlertAnswer('board', (alert, answer, actor) => board.answer(alert.ref, answer));
await app.rbe.sendAlert({ to: 'sam@acme.example', title: 'Review the hand-off?', question: 'Approve?', options: ['Yes', 'No'], app: 'board', ref: 'task-42' });
app.on('email.message.received', (m) => crm.logEmail(m));
// timers: app.mb.sync() every minute, app.rbe.poll() every 30 seconds, app.rbe.maybeSendDigest() every minute
```

Events: `email.message.received`, `email.message.sent`, `email.command.received`, `email.alert.answered`.

## Environment

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres. Empty means SQLite at `SQLITE_FILE` (default `./data/email.sqlite`). |
| `EMAIL_SECRET_KEY` | Encrypts mailbox passwords. Keep it outside the database and backed up. |
| `OAUTH_SECRET` | Signs sessions, reply tokens and signed links. |
| `PUBLIC_URL` | The app's address, used in signed links. |
| `TEAM_MEMBERS` | First members on a fresh install: `Name <email> @github owner, ...` |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | GitHub sign-in (optional). |
| `SMTP_URL`, `MAIL_FROM` | Mail the app sends itself, such as sign-in links. Falls back to the command mailbox. |
| `MODEL_BASE_URL`, `MODEL_API_KEY`, `MODEL_NAME` | Any OpenAI-compatible model for sorting and drafts. |
| `FILES_DIR` | Where message bodies are kept (default `./data/files`). |
| `SYNC_SECONDS`, `POLL_SECONDS` | How often mail and the command address are checked. |
| `CRON_SECRET` | Lets a scheduler call `/api/cron` instead of the built-in timers. |
| `SQLITE_FILE` | The SQLite file when there is no `DATABASE_URL`. |
| `WOS_DEMO` | The demo: a made-up mailbox on the in-memory mail server. |

## Development

```
npm install
npm run dev          # the demo on http://localhost:3990 (standalone.mjs --demo)
npm run build:screens  # bundle the suite screen part into dist/screens.mjs
npm test             # unit, run-by-email and parity tests
npm run test:e2e     # against GreenMail and Postgres in Docker
npm run shots        # screenshots at 1440 and 390, light and dark, into .shots/
npm run sync-kit     # copy the ui-design kit from ../waronsaas-ui-design main
npm run tools:json   # regenerate tools.json from lib/tools.mjs
```

| Piece | Licence |
|---|---|
| This app | AGPL-3.0 |
| imapflow, mailparser, mailauth | MIT |
| nodemailer | MIT-0 |
| ui-design kit (in `public/ui`) | Apache-2.0, fonts under the SIL Open Font License |
| GreenMail (test mail server, not shipped) | Apache-2.0 |

## Not yet

Gmail and Microsoft sign-in links (v1; for now use an app password), snooze to a chosen time from the screen (agents and email can already give any time), send later, attachments in compose, shared inboxes, IMAP push (mail is checked every minute).
