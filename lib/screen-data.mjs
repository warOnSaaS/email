// Which tools a screen calls, and how it draws: shared by the standalone server (it renders the HTML
// before sending it) and the suite's screen part (it renders in the browser). Only tool calls here, so
// a screen can never see more than an agent with the same sign-in.
import * as pages from './pages.mjs';

const VIEWS = ['needs_you', 'fyi', 'news', 'all', 'snoozed', 'archived'];

// call(name, input) returns the tool's result or throws; ctx = { me, name, demo, version, wrap? }.
export async function renderScreen(fullPath, call, ctx, { back = '/' } = {}) {
  const url = new URL(fullPath, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const [, a, b] = p.split('/');
  const settings = await call('email.get_settings', {});
  const accounts = (await call('email.list_accounts', {})).accounts;
  const first = await call('email.list_threads', { view: 'needs_you', limit: 1 });
  const approvals = (await call('email.list_approvals', {})).approvals;
  const drafts = (await call('email.list_drafts', {})).drafts;
  const c = { ...ctx, outsideNeedsYes: settings.send_outside_needs_yes, counts: { ...(first.counts ?? {}), approvals: approvals.length, drafts: drafts.length } };
  const mine = accounts.find((x) => x.purpose === 'mailbox');

  if (p === '/' || (a === 'inbox' && b)) {
    const view = p === '/' ? 'needs_you' : b;
    if (!VIEWS.includes(view)) return null;
    const out = await call('email.list_threads', { view });
    return pages.renderInbox(c, { view, threads: out.threads, account: mine?.address });
  }
  if (a === 'search') {
    const q = url.searchParams.get('q') ?? '';
    const threads = q ? (await call('email.search', { q })).threads : [];
    return pages.renderInbox(c, { view: 'search', threads, q, account: mine?.address });
  }
  if (a === 't' && b) return pages.renderThread(c, await call('email.read_thread', { thread_id: decodeURIComponent(b) }), { back });
  if (p === '/drafts') return pages.renderDrafts(c, { drafts });
  if (p === '/approvals') {
    const past = (await call('email.list_approvals', { status: 'all' })).approvals.filter((x) => x.status !== 'pending').slice(0, 20);
    c.draftsById = new Map(drafts.map((d) => [d.id, d]));
    return pages.renderApprovals(c, { pending: approvals, past });
  }
  if (p === '/by-email') {
    const log = await call('email.list_commands', {});
    return pages.renderByEmail(c, { settings, command: accounts.find((x) => x.purpose === 'commands'), commands: log.commands, alerts: (await call('email.list_alerts', {})).alerts, apps: log.apps ?? ['email'] });
  }
  if (p === '/settings') return pages.renderSettings(c, { accounts, settings, members: (await call('email.list_members', {})).members, model: !!ctx.model });
  return null;
}

export function notFound(ctx) {
  return (ctx.wrap ?? pages.layout)(ctx, { title: 'Not found', current: '', body: '<div class="ui-card zero"><h2>Not found</h2><p><a href="/">Back to the inbox</a></p></div>' });
}
