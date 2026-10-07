// wOS Email in the browser: the keyboard, dialogs, and one way to change anything, call(), which posts
// to /api/tools/<name>, the same tools agents use. No other request leaves this file.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

async function call(name, input) {
  const r = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'wos-email' },
    body: JSON.stringify(input ?? {}),
  });
  try { return await r.json(); } catch { return { ok: false, error: `The server answered ${r.status}` }; }
}

// ---------- toast with undo ----------
let toastTimer;
function toast(text, undo) {
  const t = $('[data-toast]');
  if (!t) return;
  t.innerHTML = '';
  t.append(document.createTextNode(text));
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'linkish'; b.textContent = 'Undo'; b.style.marginLeft = '10px'; b.style.color = 'inherit';
    b.dataset.ui = 'undo';
    b.onclick = async () => { t.classList.remove('is-on'); const out = await call(undo.tool, undo.input); if (out.ok) location.reload(); };
    t.append(b);
  }
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), undo ? 5000 : 2600);
}

// ---------- reading a form into tool input ----------
function formInput(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button') continue;
    if (el.type === 'checkbox') { out[el.name] = el.checked; continue; }
    const v = el.value.trim();
    if (v === '') continue;
    if (el.type === 'number') out[el.name] = Number(v);
    else if (el.hasAttribute('data-json')) out[el.name] = JSON.parse(v);
    else if (el.hasAttribute('data-rules')) out[el.name] = parseRules(v);
    else out[el.name] = v;
  }
  if (form.querySelector('[data-rules]') && !out.rules) out.rules = [];
  return out;
}

// "from *@news.example -> news", "subject invoice -> fyi", "from x and subject y -> needs_you"
function parseRules(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [lhs, rhs] = l.split('->').map((s) => (s ?? '').trim());
    const r = { triage: (rhs || 'fyi').toLowerCase().replace(/\s+/g, '_').replace('newsletters', 'news').replace('needs_you', 'needs_you') };
    const from = /from\s+(\S+)/i.exec(lhs)?.[1];
    const subject = /subject\s+(.+?)(\s+and\s+|$)/i.exec(lhs)?.[1];
    if (from) r.from = from;
    if (subject) r.subject = subject;
    return r;
  });
}

// ---------- running an action ----------
async function run(el, name, input) {
  if (el?.dataset.confirm && !confirm(el.dataset.confirm)) return;
  const busy = el?.closest('form') ?? el;
  busy?.classList.add('is-busy');
  const out = await call(name, input);
  busy?.classList.remove('is-busy');
  if (!out.ok) return toast(out.error || 'That did not work');
  if (out.status === 'needs_approval') { toast('Waiting for a yes. See Approvals.'); return setTimeout(() => location.reload(), 900); }
  const after = el?.dataset.after ?? 'reload';
  const first = String(out.text ?? 'Done').split('\n')[0];
  if (after === 'remove') {
    const row = el.closest('[data-row]');
    const undo = el.dataset.undo ? { tool: name, input: JSON.parse(el.dataset.undo) } : null;
    if (row) { row.classList.add('is-gone'); setTimeout(() => { const next = row.nextElementSibling; row.remove(); select(next && next.matches('[data-row]') ? rows().indexOf(next) : sel - 1); }, 160); }
    return toast(first, undo);
  }
  if (after === 'back') { sessionStorageSafe('toast', first); return goBack(); }
  if (after === 'download') {
    const blob = new Blob([JSON.stringify(out.result, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `email-export-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    return toast(first);
  }
  if (after === 'stay') {
    const fill = el.dataset.fill && el.closest('form')?.querySelector(`[name="${el.dataset.fill}"]`);
    if (fill && out.result?.body != null) {
      fill.value = out.result.body;
      const f = el.closest('form');
      let h = f.querySelector('input[name="draft_id"]');
      if (!h) { h = Object.assign(document.createElement('input'), { type: 'hidden', name: 'draft_id' }); f.append(h); }
      h.value = out.result.id;
    }
    return toast(first);
  }
  sessionStorageSafe('toast', first);
  location.reload();
}

function sessionStorageSafe(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
function goBack() { const b = $('[data-back]'); location.href = b ? b.getAttribute('href') : '/'; }

document.addEventListener('click', (e) => {
  const el = e.target.closest('button[data-tool]:not([type=submit])');
  if (el) { e.preventDefault(); return run(el, el.dataset.tool, JSON.parse(el.dataset.input || '{}')); }
  const ui = e.target.closest('[data-ui]');
  if (ui) {
    const what = ui.dataset.ui;
    if (what === 'compose') openDialog('compose');
    else if (what === 'help') openDialog('help');
    else if (what === 'label') openLabel();
    else if (what === 'search') focusSearch();
    else if (what === 'close') ui.closest('dialog')?.close();
    return;
  }
  const row = e.target.closest('[data-row][data-href]');
  if (row && !e.target.closest('a,button')) location.href = row.dataset.href;
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-tool]');
  if (!form) return;
  e.preventDefault();
  const btn = e.submitter?.dataset.tool ? e.submitter : form;
  const input = formInput(form);
  if (form.dataset.nav) { if (input.q) location.href = `${form.dataset.nav}?q=${encodeURIComponent(input.q)}`; return; }
  if (btn.hasAttribute?.('data-ai')) {
    // The words typed become the instructions for the model; it writes the text.
    if (input.body) { input.instructions = input.body; delete input.body; }
    input.ai = true;
  }
  const el = btn === form ? form : btn;
  if (el.dataset && !el.dataset.after && form.dataset.after) el.dataset.after = form.dataset.after;
  run(el, btn.dataset.tool, input);
});

// ---------- dialogs ----------
function openDialog(id) { const d = document.getElementById(id); if (d && !d.open) { d.showModal(); d.querySelector('input:not([type=hidden]),textarea')?.focus(); } }
function openLabel() {
  const id = currentThread();
  if (!id) return toast('Pick a conversation first');
  $('#label [data-current-thread]').value = id;
  openDialog('label');
}
function focusSearch() { const s = $('[data-search]'); if (s && s.offsetParent) { s.focus(); s.select(); } else location.href = '/search'; }

// ---------- the list and the keyboard ----------
const rows = () => $$('[data-row]');
let sel = -1;
function select(i) {
  const r = rows();
  if (!r.length) { sel = -1; return; }
  sel = Math.max(0, Math.min(i, r.length - 1));
  r.forEach((x, j) => x.setAttribute('aria-current', j === sel ? 'true' : 'false'));
  r[sel].scrollIntoView({ block: 'nearest' });
}
const threadPage = () => $('[data-thread-page]');
const currentThread = () => threadPage()?.dataset.thread ?? rows()[sel]?.dataset.thread;
const press = (sel2) => { const b = $(sel2); if (b) b.click(); return !!b; };
const rowButton = (tool, extra = '') => rows()[sel]?.querySelector(`button[data-tool="${tool}"]${extra}`);

let pending = '';
let pendingTimer;
const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'Enter') {
    const form = e.target.closest?.('form') ?? $('dialog[open] form') ?? $('#reply');
    const send = form?.querySelector('button[data-tool="email.send"]');
    if (send) { e.preventDefault(); form.requestSubmit(send); }
    return;
  }
  if (e.key === 'Escape') {
    if ($('dialog[open]')) return;
    if (typing(e.target)) return e.target.blur();
    if (threadPage()) return goBack();
    return;
  }
  if (typing(e.target) || mod || e.altKey) return;
  const k = e.key;
  if (pending === 'g') {
    pending = '';
    const go = { i: '/', f: '/inbox/fyi', n: '/inbox/news', a: '/inbox/all', d: '/drafts', y: '/approvals' }[k];
    if (go) { e.preventDefault(); location.href = go; }
    return;
  }
  if (k === 'g') { pending = 'g'; clearTimeout(pendingTimer); pendingTimer = setTimeout(() => (pending = ''), 900); return; }
  const id = currentThread();
  const act = {
    j: () => select(sel + 1),
    ArrowDown: () => select(sel + 1),
    k: () => select(sel - 1),
    ArrowUp: () => select(sel - 1),
    Enter: () => { const r = rows()[sel]; if (r?.dataset.href) location.href = r.dataset.href; },
    o: () => { const r = rows()[sel]; if (r?.dataset.href) location.href = r.dataset.href; },
    e: () => threadPage() ? press('.thread-acts [data-tool="email.archive"]') : rowButton('email.archive')?.click(),
    E: () => id && run(null, 'email.archive', { thread_id: id, archived: false }),
    h: () => threadPage() ? press('.thread-acts [data-tool="email.snooze"]') : rowButton('email.snooze')?.click(),
    u: () => id && run(threadPage() ? $('.thread-acts [data-tool="email.mark_read"]') : null, 'email.mark_read', { thread_id: id, read: false }),
    '#': () => threadPage() ? press('.thread-acts [data-tool="email.delete_thread"]') : id && confirm('Delete this conversation?') && run(null, 'email.delete_thread', { thread_id: id }),
    1: () => id && run(null, 'email.triage', { thread_id: id, bucket: 'needs_you' }),
    2: () => id && run(null, 'email.triage', { thread_id: id, bucket: 'fyi' }),
    3: () => id && run(null, 'email.triage', { thread_id: id, bucket: 'news' }),
    l: () => openLabel(),
    r: () => { const t = $('[data-reply]'); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } else if (rows()[sel]) location.href = `${rows()[sel].dataset.href}#reply`; },
    d: () => { const f = $('#reply'); const b = f?.querySelector('[data-ai]'); if (b) f.requestSubmit(b); },
    c: () => openDialog('compose'),
    '/': () => focusSearch(),
    s: () => press('[data-tool="email.sync"]') || run(null, 'email.sync', {}),
    '?': () => openDialog('help'),
  }[k];
  if (act) { e.preventDefault(); act(); }
});

// A message carried across a reload.
try { const t = sessionStorage.getItem('toast'); if (t) { sessionStorage.removeItem('toast'); toast(t); } } catch {}
if (rows().length && !threadPage()) select(0);
if (location.hash === '#reply') $('[data-reply]')?.focus();
