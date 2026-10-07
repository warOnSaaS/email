/* ui-design · render
   Pure functions: one block in, one HTML string out. The browser engine and the static
   prerender both use these, so a page written for crawlers and the page a person sees
   are the same markup. No DOM, no dependencies. */

export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');

/* The words the kit writes itself. Override any of them with "words" in content.json. */
export const WORDS = {
  askNext: 'Ask next', topics: 'Topics', back: 'Back', send: 'Send', close: 'Close', thinking: 'Thinking',
  more: 'More', library: 'Everything we answer', placeholder: 'Ask anything',
  noMatch: 'Nothing matches.', prev: 'Prev', next: 'Next', range: '{from} to {to} of {total}',
  submit: 'Send', sending: 'Sending…', sent: 'Sent. A person will reply.', failed: 'That did not send. Try again.',
  fallback: 'I answer the questions in Topics. Pick one, or ask it another way.', optional: 'optional',
};
export const words = w => ({ ...WORDS, ...(w || {}) });
const W = ctx => ctx?.words || WORDS;

const tone = n => n >= 80 ? 'hi' : n >= 50 ? 'mid' : 'lo';

/* ---- calc: a small, safe expression language for sums a visitor can change ----
   numbers, names, + - * / ( ), comparisons, and min max round ceil floor abs if(cond, a, b).
   No eval, so a strict Content-Security-Policy is fine. */
const FN = { min: Math.min, max: Math.max, round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, ceil: Math.ceil, floor: Math.floor, abs: Math.abs, if: (c, a, b) => (c ? a : b) };
export function evaluate(src, scope = {}) {
  const t = String(src).match(/\d*\.?\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|>=|<=|==|!=|[-+*/(),<>]/g) || [];
  let i = 0;
  const peek = () => t[i], take = () => t[i++];
  const cmp = () => { let a = sum(); while (/^(>=|<=|==|!=|<|>)$/.test(peek() || '')) { const o = take(), b = sum(); a = o === '>' ? a > b : o === '<' ? a < b : o === '>=' ? a >= b : o === '<=' ? a <= b : o === '==' ? a === b : a !== b; a = +a; } return a; };
  const sum = () => { let a = prod(); while (peek() === '+' || peek() === '-') a = take() === '+' ? a + prod() : a - prod(); return a; };
  const prod = () => { let a = unary(); while (peek() === '*' || peek() === '/') a = take() === '*' ? a * unary() : a / unary(); return a; };
  const unary = () => (peek() === '-' ? (take(), -unary()) : peek() === '+' ? (take(), unary()) : atom());
  const atom = () => {
    const x = take();
    if (x === '(') { const v = cmp(); take(); return v; }
    if (/^[\d.]/.test(x)) return parseFloat(x);
    if (x in FN && peek() === '(') { take(); const args = []; while (peek() !== ')' && i < t.length) { args.push(cmp()); if (peek() === ',') take(); } take(); return FN[x](...args); }
    return Number(scope[x]) || 0;
  };
  const v = cmp();
  return Number.isFinite(v) ? v : 0;
}
export function formatNumber(v, f, b = {}) {
  const fmt = typeof f === 'string' ? { as: f } : (f || {});
  const as = fmt.as || 'number', locale = b.locale || 'en-US';
  const dec = fmt.decimals ?? (as === 'money' ? (Math.abs(v) < 100 && v % 1 ? 2 : 0) : as === 'percent' ? 0 : (v % 1 ? 1 : 0));
  let s;
  try {
    s = as === 'money' ? new Intl.NumberFormat(locale, { style: 'currency', currency: b.currency || 'USD', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v)
      : as === 'percent' ? new Intl.NumberFormat(locale, { maximumFractionDigits: dec }).format(v) + '%'
      : new Intl.NumberFormat(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  } catch { s = String(Math.round(v * 100) / 100); }
  return (fmt.prefix || '') + s + (fmt.suffix || '');
}
/* every line's value, worked out in order (a line can use an earlier line's name) */
export function calcValues(b, inputs) {
  const scope = {};
  for (const f of b.inputs || []) scope[f.name] = inputs && f.name in inputs ? Number(inputs[f.name]) : Number(f.type === 'select' && f.value == null ? optionsOf(f)[0]?.[0] : f.value) || 0;
  const lines = (b.lines || []).map(l => { const v = evaluate(l.value, scope); if (l.name) scope[l.name] = v; return v; });
  const total = b.total && !Array.isArray(b.total) ? evaluate(b.total.value, scope) : null;
  return { scope, lines, total };
}
const optionsOf = f => (f.options || []).map(o => Array.isArray(o) ? [o[0], o[1] ?? o[0]] : typeof o === 'object' ? [o.value, o.label ?? o.value] : [o, o]);

function calcBlock(b) {
  if (!b.inputs) /* the static sum: a header, rows and a total, as columns */
    return `<div class="ui-calc"><div class="ui-calc-r ui-calc-h">${b.head.map(h => `<span>${esc(h)}</span>`).join('')}</div>${b.rows.map(r => `<div class="ui-calc-r">${r.map(c => `<span>${esc(c)}</span>`).join('')}</div>`).join('')}${b.total ? `<div class="ui-calc-r ui-calc-t"><span>${esc(b.total[0])}</span>${b.total.slice(1).map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div>`;
  const v = calcValues(b);
  const input = f => {
    const id = esc(f.name), val = v.scope[f.name];
    if (f.type === 'select') return `<select class="ui-select" name="${id}">${optionsOf(f).map(([o, l]) => `<option value="${esc(o)}"${Number(o) === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (f.type === 'range') return `<div class="ui-range"><input type="range" name="${id}" min="${esc(f.min ?? 0)}" max="${esc(f.max ?? 100)}" step="${esc(f.step ?? 1)}" value="${esc(val)}"><output>${esc(formatNumber(val, f.format, b))}</output></div>`;
    return `<input class="ui-input" type="number" inputmode="decimal" name="${id}" value="${esc(val)}"${f.min != null ? ` min="${esc(f.min)}"` : ''}${f.max != null ? ` max="${esc(f.max)}"` : ''}${f.step != null ? ` step="${esc(f.step)}"` : ''}>`;
  };
  const line = (l, val, cls = '') => `<div class="ui-calc-r is-2${cls}"><span>${esc(l.label)}</span><span>${esc(formatNumber(val, l.format ?? b.format, b))}</span></div>`;
  return `<div class="ui-calc" data-ui-calc><div class="ui-calc-in">${b.inputs.map(f => `<label><span>${esc(f.label || f.name)}</span>${input(f)}</label>`).join('')}</div>${(b.lines || []).map((l, k) => line(l, v.lines[k])).join('')}${b.total ? line(b.total, v.total, ' ui-calc-t') : ''}<script type="application/json">${json({ inputs: b.inputs, lines: b.lines, total: b.total, format: b.format, currency: b.currency, locale: b.locale })}</script></div>`;
}

export const recordItem = it => { const tg = it.href ? 'a' : 'div'; return `<${tg} class="ui-record"${it.href ? ` href="${esc(it.href)}"` : ''}>${it.av != null ? `<span class="ui-avatar is-sm${it.square ? ' is-square' : ''}" data-tone="${esc(it.tone ?? toneOf(it.title))}">${esc(it.av)}</span>` : ''}<span><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.tag ? `<em${it.late ? ' class="is-late"' : ''}>${esc(it.tag)}</em>` : ''}</${tg}>`; };
/* the same name always gets the same tone, 1 to 5 */
export const toneOf = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 1 + (h % 5); };

/* ---- table: any number of columns, an optional header row ---- */
export const tableRow = (r, cols) => `<div class="ui-table-r">${Array.from({ length: cols }, (_, k) => `<span>${esc(r[k] ?? '')}</span>`).join('')}</div>`;
export const tableHead = (h, cols) => h ? `<div class="ui-table-r ui-table-h" role="row">${Array.from({ length: cols }, (_, k) => `<span role="columnheader">${esc(h[k] ?? '')}</span>`).join('')}</div>` : '';
function tableBlock(b, ctx) {
  /* columns: b.cols, else as many as the header names, else three (the first format). Extra values in a
     row (a key to filter on) stay hidden. */
  const cols = b.cols || b.head?.length || 3, w = W(ctx);
  const body = `<div class="ui-table-b"${cols !== 3 ? ` data-cols="${cols}"` : ''}>${tableHead(b.head, cols)}${b.rows.slice(0, b.page || 10).map(r => tableRow(r, cols)).join('')}</div>`;
  return `<div class="ui-table" data-ui-table>${b.filters ? `<div class="ui-chips">${b.filters.map((f, k) => `<button type="button" data-f="${esc(f[0])}" aria-pressed="${k === 0}">${esc(f[1])}</button>`).join('')}</div>` : ''}${b.search ? `<input class="ui-input" data-q placeholder="${esc(b.search)}" aria-label="${esc(b.search)}">` : ''}${cols >= 5 ? `<div class="ui-table-s">${body}</div>` : body}<div class="ui-pager"></div><script type="application/json">${json({ rows: b.rows, head: b.head || null, cols, page: b.page || 10, filterCol: b.filterCol ?? null, words: { noMatch: w.noMatch, prev: w.prev, next: w.next, range: w.range } })}</script></div>`;
}

/* ---- form: visible labels, selects, checkboxes, radios, two fields to a row ---- */
function field(f, b) {
  const name = esc(f.name), req = f.required ? ' required' : '', label = esc(f.label || f.name), ph = f.placeholder != null ? esc(f.placeholder) : '';
  const half = f.half ? ' is-half' : '';
  if (b.labels === 'placeholder') /* the first look: no labels on screen, the label as placeholder */
    return f.type === 'textarea' ? `<textarea name="${name}" placeholder="${label}" aria-label="${label}"${req}></textarea>` : `<input name="${name}" type="${esc(f.type || 'text')}" placeholder="${label}" aria-label="${label}"${req}>`;
  if (f.type === 'checkbox') return `<label class="ui-check${half}"><input type="checkbox" name="${name}" value="${esc(f.value ?? 'yes')}"${req}${f.checked ? ' checked' : ''}><span>${label}</span></label>`;
  const hint = f.hint ? `<span class="ui-hint">${esc(f.hint)}</span>` : '';
  const head = `<span>${label}${!f.required && b.markOptional ? ` <small>${esc(W(b._ctx).optional)}</small>` : ''}</span>`;
  if (f.type === 'radio') return `<div class="ui-field${half}" role="radiogroup" aria-label="${label}">${head}<div class="ui-radios">${optionsOf(f).map(([v, l], k) => `<label class="ui-check"><input type="radio" name="${name}" value="${esc(v)}"${(f.value != null ? String(f.value) === String(v) : k === 0) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>${hint}</div>`;
  let control;
  if (f.type === 'select') control = `<select class="ui-select" name="${name}"${req}>${ph ? `<option value="">${ph}</option>` : ''}${optionsOf(f).map(([v, l]) => `<option value="${esc(v)}"${f.value != null && String(f.value) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') control = `<textarea class="ui-textarea" name="${name}"${ph ? ` placeholder="${ph}"` : ''}${req}></textarea>`;
  else control = `<input class="ui-input" name="${name}" type="${esc(f.type || 'text')}"${ph ? ` placeholder="${ph}"` : ''}${f.autocomplete ? ` autocomplete="${esc(f.autocomplete)}"` : ''}${req}>`;
  return `<label class="ui-field${half}">${head}${control}${hint}</label>`;
}
function formBlock(b, ctx) {
  const w = W(ctx), B = { ...b, _ctx: ctx };
  return `<form class="ui-form" data-ui-form="${esc(b.action)}" data-sending="${esc(w.sending)}" data-sent="${esc(b.sent || w.sent)}" data-failed="${esc(w.failed)}">${b.fields.map(f => field(f, B)).join('')}<input class="ui-hp" name="${esc(b.honeypot || 'website_url')}" tabindex="-1" autocomplete="off" aria-hidden="true"><div class="ui-form-row"><button type="submit">${esc(b.submit || w.submit)}</button><span class="ui-form-msg" aria-live="polite"></span></div></form>`;
}

/* Every block a question's answer can contain. `ctx.label(id)` turns a question id into its
   prompt text, `ctx.href(id)` into its address (for real links that work without script),
   `ctx.words` holds the kit's own words. */
export const BLOCKS = {
  text: b => `<p>${esc(b.text)}</p>`,
  step: b => `<div class="ui-step is-done"><i></i><span>${esc(b.text)}</span></div>`,
  tool: b => `<div class="ui-tool"><b>${esc(b.name)}</b><span>${esc(b.arg || '')}</span><em>${esc(b.out || '')}</em></div>`,
  stats: b => `<div class="ui-stats">${b.items.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`,
  /* an item's last value may be an href: then the row or card is a link */
  rows: b => `<div class="ui-rows">${b.items.map(([t, tag, href]) => { const tg = href ? 'a' : 'div'; return `<${tg} class="ui-row"${href ? ` href="${esc(href)}"` : ''}><span>${esc(t)}</span>${tag ? `<span class="ui-tag">${esc(tag)}</span>` : ''}</${tg}>`; }).join('')}</div>`,
  cards: b => `<ul class="ui-cards">${b.items.map(([t, tag, d, href]) => { const inner = `<div class="ui-card-t"><span>${esc(t)}</span>${tag ? `<span class="ui-tag">${esc(tag)}</span>` : ''}</div>${d ? `<p>${esc(d)}</p>` : ''}`; return `<li>${href ? `<a href="${esc(href)}">${inner}</a>` : inner}</li>`; }).join('')}</ul>`,
  /* records: linked records with initials (or nothing), a title, a line under it and a note on the right.
     items: [{ href, title, sub, tag, av, tone, square, late }] */
  records: b => `<div class="ui-records">${b.items.map(recordItem).join('')}</div>`,
  accordion: b => `<div class="ui-acc">${b.items.map(([t, tag, d]) => `<details><summary><span>${esc(t)}</span>${tag ? `<span class="ui-tag">${esc(tag)}</span>` : ''}</summary>${d ? `<div class="ui-acc-b">${esc(d).replace(/\n/g, '<br>')}</div>` : ''}</details>`).join('')}</div>`,
  calc: calcBlock,
  score: b => `<div class="ui-score"><div class="ui-score-g">${esc(b.grade)}<small>/100</small></div><div><div class="ui-score-h">${esc(b.title || '')}</div><ul>${b.areas.map(([l, v]) => `<li><span>${esc(l)}</span><i class="is-${tone(v)}" style="--w:${Number(v) || 0}%"></i><b>${esc(v)}</b></li>`).join('')}</ul></div></div>`,
  table: tableBlock,
  form: formBlock,
  ask: (b, ctx) => `<a class="ui-ask" href="${esc(ctx.href(b.id))}" data-ask="${esc(b.id)}">${esc(b.text || ctx.label(b.id))} →</a>`,
  gallery: b => `<ul class="ui-gallery">${b.items.map(([t, tag, d, href, img]) => `<li><a href="${esc(href || '#')}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<div class="ui-card-t"><span>${esc(t)}</span>${tag ? `<span class="ui-tag">${esc(tag)}</span>` : ''}</div>${d ? `<p>${esc(d)}</p>` : ''}</a></li>`).join('')}</ul>`,
  link: b => `<a class="ui-ask" href="${esc(b.href)}">${esc(b.text)} →</a>`,
};

export function renderBlock(b, ctx) {
  const f = BLOCKS[b.t];
  return f ? f(b, ctx) : '';
}

/* A whole answer, finished: what the prerender writes into the page. */
export function renderAnswer(q, ctx) {
  return `<div class="ui-you"><p>${esc(q.prompt)}</p></div><div class="ui-ai"><div class="ui-av" aria-hidden="true">${esc(ctx.avatar || '')}</div><div class="ui-body">${q.blocks.map(b => renderBlock(b, ctx)).join('')}${renderNext(q, ctx)}</div></div>`;
}

export function renderNext(q, ctx) {
  if (!q.next || !q.next.length) return '';
  return `<div class="ui-next"><p class="ui-next-k">${esc(W(ctx).askNext)}</p><div class="ui-next-l">${q.next.map(id => `<a href="${esc(ctx.href(id))}" data-ask="${esc(id)}">${esc(ctx.label(id))}</a>`).join('')}</div></div>`;
}

/* Plain text of an answer, for meta descriptions and structured data. */
export function answerText(q) {
  const t = [];
  for (const b of q.blocks) {
    if (b.text) t.push(b.text);
    if (b.items) for (const it of b.items) t.push([].concat(it).filter(Boolean).join(': '));
  }
  return t.join(' ').replace(/\s+/g, ' ').trim();
}
