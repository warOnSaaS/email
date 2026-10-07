// wOS Email in the browser, standalone: server-rendered screens plus wire(), which sends every action
// to /api/tools/<name>, the same tools agents use. No other request leaves this page.
import { wire, callTool } from './wire.mjs';

const toastEl = document.querySelector('[data-toast]');
let toastTimer;
function toast(text, undo) {
  if (!toastEl) return;
  toastEl.innerHTML = '';
  toastEl.append(document.createTextNode(text));
  if (undo) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'linkish', textContent: 'Undo' });
    b.dataset.tool = 'none'; b.dataset.why = 'Undo runs the opposite tool call'; b.dataset.ui = 'undo';
    b.style.cssText = 'margin-left:10px;color:inherit';
    b.onclick = async () => { toastEl.classList.remove('is-on'); const out = await callTool(undo.tool, undo.input); if (out.ok) location.reload(); };
    toastEl.append(b);
  }
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), undo ? 5000 : 2600);
}
const keep = (msg) => { try { if (msg) sessionStorage.setItem('toast', msg); } catch {} };

wire(document, {
  call: callTool,
  go: (path) => { location.href = path; },
  reload: (msg) => { keep(msg); location.reload(); },
  back: (msg) => { keep(msg); const b = document.querySelector('[data-back]'); location.href = b ? b.getAttribute('href') : '/'; },
  toast,
});

// A message carried across a reload.
try { const t = sessionStorage.getItem('toast'); if (t) { sessionStorage.removeItem('toast'); toast(t); } } catch {}
if (location.hash === '#reply') document.querySelector('[data-reply]')?.focus();
