// The screen part the wOS suite loads (packages/manifest, section 5): { mount(el, ctx) }.
// Built into dist/screens.mjs by npm run build:screens. The same screens and keyboard as the standalone
// app, drawn in the browser from tool results; ctx.callTool is the only way to the server.
import { renderScreen, notFound } from '../lib/screen-data.mjs';
import { embedded } from '../lib/pages.mjs';
import { wire } from '../public/app/wire.mjs';
import css from '../public/app/email.css';

const LIVE = ['email.message.received', 'email.message.sent', 'email.command.received', 'email.alert.answered'];

export default {
  title: 'Email',
  mount(el, ctx) {
    const doc = el.ownerDocument;
    el.classList.add('email-root');
    // Parts the kit does not have yet (listed for the kit lane in the README), scoped to this app.
    if (!doc.getElementById('wos-email-style')) doc.head.append(Object.assign(doc.createElement('style'), { id: 'wos-email-style', textContent: css }));

    let path = ctx.path || '/';
    const history = [];
    let unwire = null;
    let drawing = 0;
    let alive = true;

    // The suite's callTool gives the result; a tool waiting for a person's yes comes back as { pending }.
    const call = async (name, input) => {
      try {
        const r = await ctx.callTool(name, input);
        if (r && r.pending) return { ok: true, status: 'needs_approval', text: r.pending.message, pending: r.pending };
        return { ok: true, status: 'done', result: r, text: r?.summary };
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    };
    const result = async (name, input) => { const o = await call(name, input); if (!o.ok) throw new Error(o.error); return o.result; };
    const me = { role: 'owner', ...ctx.me, email: ctx.me?.email ?? '' };

    async function draw(message) {
      const n = ++drawing;
      let html;
      try {
        html = (await renderScreen(path, result, { me, name: 'Email', wrap: embedded, version: '' }, { back: history.at(-1) ?? '/' })) ?? notFound({ me, wrap: embedded });
      } catch (e) {
        html = embedded({ me }, { body: `<div class="ui-notice is-quiet">${String(e.message).replace(/</g, '&lt;')}</div>` });
      }
      if (!alive || n !== drawing) return;
      unwire?.();
      el.innerHTML = html;
      unwire = wire(el, io);
      if (message) ctx.toast(message);
    }

    const go = (p) => { history.push(path); path = p; ctx.navigate?.(p); draw(); };
    const io = {
      call,
      go,
      links: true,
      reload: (msg) => draw(msg),
      back: (msg) => { path = history.pop() ?? '/'; ctx.navigate?.(path); draw(msg); },
      toast: (text) => ctx.toast(text),
    };

    const offs = LIVE.map((ev) => ctx.on?.(ev, () => { if (!el.querySelector('dialog[open]') && !el.contains(doc.activeElement)) draw(); }) ?? (() => {}));
    draw();
    return {
      unmount() { alive = false; unwire?.(); for (const off of offs) off(); el.innerHTML = ''; el.classList.remove('email-root'); },
      update(p) { if (p !== path) { path = p; draw(); } },
    };
  },
};
