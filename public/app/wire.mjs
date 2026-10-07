// The screen behaviour, shared by the standalone app (app.mjs) and the suite's screen part (screens/):
// the keyboard, dialogs, and one way to change anything, io.call(name, input), which reaches the same tools
// agents use. root is the document (standalone) or the element the suite gave us.
//
// io: {
//   call(name, input) -> { ok, status, result, text, error }
//   go(path)          move to another screen
//   reload(message)   draw this screen again, then show message
//   toast(text, undo) show a short message, with an Undo action when undo = { tool, input }
//   back()            leave a thread
// }

export function wire(root, io) {
  const doc = root.ownerDocument ?? root;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const off = [];
  const on = (target, ev, fn) => { target.addEventListener(ev, fn); off.push(() => target.removeEventListener(ev, fn)); };

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

  // ---------- running an action ----------
  async function run(el, name, input) {
    if (el?.dataset?.confirm && !confirm(el.dataset.confirm)) return;
    const busy = el?.closest?.('form') ?? el;
    busy?.classList?.add('is-busy');
    const out = await io.call(name, input);
    busy?.classList?.remove('is-busy');
    if (!out.ok) return io.toast(out.error || 'That did not work');
    if (out.status === 'needs_approval') return io.reload('Waiting for a yes. See Approvals.');
    const after = el?.dataset?.after ?? 'reload';
    const first = String(out.text ?? 'Done').split('\n')[0].replace(/\s*\((?:approval )?[a-z]{1,3}_[a-z2-9]{6,}\)/g, '');
    if (after === 'remove') {
      const row = el.closest('[data-row]');
      const undo = el.dataset.undo ? { tool: name, input: JSON.parse(el.dataset.undo) } : null;
      if (row) {
        row.classList.add('is-gone');
        setTimeout(() => { const next = row.nextElementSibling; row.remove(); select(next && next.matches('[data-row]') ? rows().indexOf(next) : sel - 1); }, 160);
      }
      return io.toast(first, undo);
    }
    if (after === 'back') return io.back(first);
    if (after === 'download') {
      const blob = new Blob([JSON.stringify(out.result, null, 2)], { type: 'application/json' });
      const a = Object.assign(doc.createElement('a'), { href: URL.createObjectURL(blob), download: `email-export-${new Date().toISOString().slice(0, 10)}.json` });
      doc.body.append(a); a.click(); a.remove();
      return io.toast(first);
    }
    if (after === 'stay') {
      const f = el.closest('form');
      const fill = el.dataset.fill && f?.querySelector(`[name="${el.dataset.fill}"]`);
      if (fill && out.result?.body != null) {
        fill.value = out.result.body;
        let h = f.querySelector('input[name="draft_id"]');
        if (!h) { h = Object.assign(doc.createElement('input'), { type: 'hidden', name: 'draft_id' }); f.append(h); }
        h.value = out.result.id;
      }
      return io.toast(first);
    }
    return io.reload(first);
  }

  on(root, 'click', (e) => {
    const el = e.target.closest('button[data-tool]:not([data-tool=none]):not([type=submit])');
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
    if (row && !e.target.closest('a,button')) return io.go(row.dataset.href);
    const back = e.target.closest('a[data-back]');
    if (back) { e.preventDefault(); return io.back(); }
    const link = e.target.closest('a[href^="/"]');
    if (link && io.links && !e.metaKey && !e.ctrlKey) { e.preventDefault(); io.go(link.getAttribute('href')); }
  });

  on(root, 'submit', (e) => {
    const form = e.target.closest('form[data-tool]');
    if (!form) return;
    e.preventDefault();
    const btn = e.submitter?.dataset.tool ? e.submitter : form;
    const input = formInput(form);
    if (form.dataset.nav) { if (input.q) io.go(`${form.dataset.nav}?q=${encodeURIComponent(input.q)}`); return; }
    if (btn.hasAttribute?.('data-ai')) {
      // The words typed become the instructions for the model; it writes the text.
      if (input.body) { input.instructions = input.body; delete input.body; }
      input.ai = true;
    }
    if (btn !== form && !btn.dataset.after && form.dataset.after) btn.dataset.after = form.dataset.after;
    run(btn, btn.dataset.tool, input);
  });

  // ---------- dialogs ----------
  function openDialog(id) { const d = $(`#${id}`); if (d && !d.open) { d.showModal(); d.querySelector('input:not([type=hidden]),textarea')?.focus(); } }
  function openLabel() {
    const id = currentThread();
    if (!id) return io.toast('Pick a conversation first');
    $('#label [data-current-thread]').value = id;
    openDialog('label');
  }
  function focusSearch() { const s = $('[data-search]'); if (s && s.offsetParent) { s.focus(); s.select(); } else io.go('/search'); }

  // ---------- the list and the keyboard ----------
  const rows = () => $$('[data-row]');
  let sel = -1;
  function select(i) {
    const r = rows();
    if (!r.length) { sel = -1; return; }
    sel = Math.max(0, Math.min(i, r.length - 1));
    r.forEach((x, j) => x.setAttribute('aria-current', j === sel ? 'true' : 'false'));
    r[sel].scrollIntoView?.({ block: 'nearest' });
  }
  const threadPage = () => $('[data-thread-page]');
  const currentThread = () => threadPage()?.dataset.thread ?? rows()[sel]?.dataset.thread;
  const press = (s) => { const b = $(s); if (b) b.click(); return !!b; };
  const rowButton = (tool) => rows()[sel]?.querySelector(`button[data-tool="${tool}"]`);

  let pending = '';
  let pendingTimer;
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  on(doc, 'keydown', (e) => {
    if (!root.isConnected && root !== doc) return;
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
      if (threadPage()) return io.back();
      return;
    }
    if (typing(e.target) || mod || e.altKey) return;
    const k = e.key;
    if (pending === 'g') {
      pending = '';
      const go = { i: '/', f: '/inbox/fyi', n: '/inbox/news', a: '/inbox/all', d: '/drafts', y: '/approvals' }[k];
      if (go) { e.preventDefault(); io.go(go); }
      return;
    }
    if (k === 'g') { pending = 'g'; clearTimeout(pendingTimer); pendingTimer = setTimeout(() => (pending = ''), 900); return; }
    const id = currentThread();
    const open = () => { const r = rows()[sel]; if (r?.dataset.href) io.go(r.dataset.href); };
    const act = {
      j: () => select(sel + 1),
      ArrowDown: () => select(sel + 1),
      k: () => select(sel - 1),
      ArrowUp: () => select(sel - 1),
      Enter: open,
      o: open,
      e: () => (threadPage() ? press('.thread-acts [data-tool="email.archive"]') : rowButton('email.archive')?.click()),
      E: () => id && run(null, 'email.archive', { thread_id: id, archived: false }),
      h: () => (threadPage() ? press('.thread-acts [data-tool="email.snooze"]') : rowButton('email.snooze')?.click()),
      u: () => id && run(threadPage() ? $('.thread-acts [data-tool="email.mark_read"]') : null, 'email.mark_read', { thread_id: id, read: false }),
      '#': () => (threadPage() ? press('.thread-acts [data-tool="email.delete_thread"]') : id && confirm('Delete this conversation?') && run(null, 'email.delete_thread', { thread_id: id })),
      1: () => id && run(null, 'email.triage', { thread_id: id, bucket: 'needs_you' }),
      2: () => id && run(null, 'email.triage', { thread_id: id, bucket: 'fyi' }),
      3: () => id && run(null, 'email.triage', { thread_id: id, bucket: 'news' }),
      l: () => openLabel(),
      r: () => { const t = $('[data-reply]'); if (t) { t.focus(); t.scrollIntoView?.({ block: 'center' }); } else if (rows()[sel]) io.go(`${rows()[sel].dataset.href}#reply`); },
      d: () => { const f = $('#reply'); const b = f?.querySelector('[data-ai]'); if (b) f.requestSubmit(b); },
      c: () => openDialog('compose'),
      '/': () => focusSearch(),
      s: () => press('[data-tool="email.sync"]') || run(null, 'email.sync', {}),
      '?': () => openDialog('help'),
    }[k];
    if (act) { e.preventDefault(); act(); }
  });

  if (rows().length && !threadPage()) select(0);
  return () => { for (const f of off) f(); clearTimeout(pendingTimer); };
}

// "from *@news.example -> news", "subject invoice -> fyi", "from x and subject y -> needs_you"
export function parseRules(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [lhs, rhs] = l.split('->').map((s) => (s ?? '').trim());
    const r = { triage: (rhs || 'fyi').toLowerCase().replace(/\s+/g, '_').replace('newsletters', 'news') };
    const from = /from\s+(\S+)/i.exec(lhs)?.[1];
    const subject = /subject\s+(.+?)(\s+and\s+|$)/i.exec(lhs)?.[1];
    if (from) r.from = from;
    if (subject) r.subject = subject;
    return r;
  });
}

// One way to the server: POST /api/tools/<name>, in the suite's reply shape.
export async function callTool(name, input, headers = { 'x-requested-with': 'wos-email' }) {
  const r = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(input ?? {}),
  });
  let body;
  try { body = await r.json(); } catch { return { ok: false, error: `The server answered ${r.status}` }; }
  if (body.error) return { ok: false, error: body.error.message ?? String(body.error) };
  if (body.pending) return { ok: true, status: 'needs_approval', text: body.pending.message, pending: body.pending };
  return { ok: true, status: 'done', result: body.result, text: body.result?.summary };
}
