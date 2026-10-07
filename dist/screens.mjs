// wOS Email screen part, built from screens/index.mjs by scripts/build-screens.mjs. AGPL-3.0. Do not edit.

// lib/labels.mjs
var BUCKET_LABEL = { needs_you: "Needs you", fyi: "FYI", news: "Newsletters" };

// lib/pages.mjs
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var attrJson = (o) => esc(JSON.stringify(o));
var REPO = "https://github.com/warOnSaaS/email";
var KEYS = [
  ["j", "Next conversation", "ui:next"],
  ["k", "Previous conversation", "ui:prev"],
  ["Enter", "Open", "ui:open"],
  ["Escape", "Back to the list", "ui:back"],
  ["e", "Archive", "email.archive"],
  ["Shift+E", "Move back to the inbox", "email.archive"],
  ["h", "Snooze until tomorrow", "email.snooze"],
  ["u", "Mark unread", "email.mark_read"],
  ["#", "Delete", "email.delete_thread"],
  ["1", "Move to Needs you", "email.triage"],
  ["2", "Move to FYI", "email.triage"],
  ["3", "Move to Newsletters", "email.triage"],
  ["l", "Label", "email.label"],
  ["r", "Reply", "ui:reply"],
  ["d", "Draft a reply with AI", "email.draft"],
  ["Mod+Enter", "Send", "email.send"],
  ["c", "Compose", "ui:compose"],
  ["/", "Search", "ui:search"],
  ["s", "Check for new mail", "email.sync"],
  ["g i", "Go to Needs you", "nav:/"],
  ["g f", "Go to FYI", "nav:/inbox/fyi"],
  ["g n", "Go to Newsletters", "nav:/inbox/news"],
  ["g a", "Go to All mail", "nav:/inbox/all"],
  ["g d", "Go to Drafts", "nav:/drafts"],
  ["g y", "Go to Approvals", "nav:/approvals"],
  ["?", "Show shortcuts", "ui:help"]
];
var ICONS = {
  needs: '<path d="M4 13h4l2 3h4l2-3h4M4 13l2.5-7h11l2.5 7v6H4z"/>',
  fyi: '<path d="M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>',
  all: '<path d="M3 7l9 6 9-6M3 7v10h18V7z"/>',
  snooze: '<path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18"/>',
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
  drafts: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  approve: '<path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM9 12l2 2 4-4"/>',
  byemail: '<path d="M4 6h16v12H4zM4 7l8 6 8-6M15 18l3 3 3-3M18 21v-6"/>',
  settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1"/>',
  compose: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.9-3M4 5v3h3M4 13a8 8 0 0 0 14.9 3M20 19v-3h-3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  keys: '<path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8"/>',
  spark: '<path d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'
};
var icon = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] ?? ""}</svg>`;
var initials = (name) => String(name || "?").replace(/[<>].*/, "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
var tone = (s) => [...String(s)].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
var avatar = (p, cls = "is-sm") => `<span class="ui-avatar ${cls}" data-tone="${tone(p?.address ?? p)}">${esc(initials(p?.name || p?.address || p))}</span>`;
var who = (p) => esc(p?.name || p?.address || "");
function when(ms, now = Date.now()) {
  const d = new Date(ms), n = new Date(now);
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  if (now - d.getTime() < 6 * 864e5) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
var NAV = [
  ["needs_you", "/", "Needs you", "needs"],
  ["fyi", "/inbox/fyi", "FYI", "fyi"],
  ["news", "/inbox/news", "Newsletters", "news"],
  ["all", "/inbox/all", "All mail", "all"],
  ["snoozed", "/inbox/snoozed", "Snoozed", "snooze"],
  ["archived", "/inbox/archived", "Archived", "archive"],
  ["drafts", "/drafts", "Drafts", "drafts"]
];
var LOW = [
  ["approvals", "/approvals", "Approvals", "approve"],
  ["by-email", "/by-email", "Run by email", "byemail"],
  ["settings", "/settings", "Settings", "settings"]
];
function layout(ctx, { title, current, body, wide = false }) {
  const c = ctx.counts ?? {};
  const count = (k) => k === "approvals" ? c.approvals : k === "drafts" ? c.drafts : c[k];
  const link = ([k, href, label, ic]) => `<a href="${href}"${current === k ? ' aria-current="page"' : ""}>${icon(ic)}<span>${esc(label)}</span>${count(k) ? `<em>${count(k)}</em>` : ""}</a>`;
  const me = ctx.me;
  return `<!doctype html><html lang="en" data-scheme="ops" data-mode="auto" data-shape="soft" data-type="grotesk" data-surface="bordered" data-motion="subtle"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} \xB7 ${esc(ctx.name)}</title><meta name="robots" content="noindex"><meta name="color-scheme" content="dark light">
<link rel="stylesheet" href="/ui/src/ui.css?v=${ctx.version}"><link rel="stylesheet" href="/ui/src/tokens.css?v=${ctx.version}"><link rel="stylesheet" href="/app/email.css?v=${ctx.version}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M3 6h18v12H3zM3 7l9 6 9-6'/%3E%3C/svg%3E">
</head><body class="mail">
<div class="ui-shell">
<aside class="ui-side">
  <a class="ui-brand" href="/"><span class="mark" aria-hidden="true">${icon("all", 15)}</span><span>${esc(ctx.name)}</span></a>
  <button type="button" class="ui-btn is-accent compose-btn" data-tool="none" data-why="Opens the compose window" data-ui="compose">${icon("compose", 15)}<span>Compose</span><span class="ui-kbd">C</span></button>
  <nav class="ui-side-nav" aria-label="Mail">${NAV.map(link).join("")}</nav>
  <nav class="ui-side-nav ui-side-low" aria-label="More">${LOW.map(link).join("")}</nav>
  <div class="ui-side-me">${avatar({ name: me.name, address: me.email })}<span>${esc(me.name)}<small>${ctx.demo ? "Demo, no sign-in" : '<a href="/logout">Sign out</a>'}</small></span></div>
  <a class="selfhost" href="${REPO}#host-it-yourself-free">Host it yourself, free</a>
</aside>
<header class="ui-topbar"><a class="ui-brand" href="/"><span class="mark" aria-hidden="true">${icon("all", 15)}</span><span>${esc(ctx.name)}</span></a><button type="button" class="ui-btn is-ghost is-icon" data-tool="none" data-why="Moves to the search box" data-ui="search" aria-label="Search">${icon("search")}</button><button type="button" class="ui-btn is-accent is-icon" data-tool="none" data-why="Opens the compose window" data-ui="compose" aria-label="Compose">${icon("compose")}</button></header>
<main class="ui-main"><div class="ui-page${wide ? " is-wide" : ""}">
${ctx.demo ? `<div class="ui-notice is-quiet demo-note"><span class="ui-chip is-soft">Demo</span><span>A made-up mailbox for Acme Dental on a mail server that lives in memory. Nothing reaches a real inbox. Try writing to <b>ops@acme.example</b> with "search invoice", or press <span class="ui-kbd">?</span> for shortcuts.</span></div>` : ""}
${body}
</div></main>
<nav class="ui-dock" aria-label="Sections"><a href="/"${current === "needs_you" ? ' aria-current="page"' : ""}>${icon("needs")}<span>Needs you</span></a><a href="/inbox/all"${current === "all" ? ' aria-current="page"' : ""}>${icon("all")}<span>All</span></a><a href="/drafts"${current === "drafts" ? ' aria-current="page"' : ""}>${icon("drafts")}<span>Drafts</span></a><a href="/approvals"${current === "approvals" ? ' aria-current="page"' : ""}>${icon("approve")}<span>Approvals</span></a><a href="/settings"${["settings", "by-email"].includes(current) ? ' aria-current="page"' : ""}>${icon("settings")}<span>More</span></a></nav>
</div>
${composeDialog(ctx)}${helpDialog()}${labelDialog()}
<div class="ui-toast" role="status" aria-live="polite" data-toast></div>
<script type="application/json" id="keys">${JSON.stringify(KEYS).replace(/</g, "\\u003c")}<\/script>
<script type="module" src="/app/app.mjs?v=${ctx.version}"><\/script>
</body></html>`;
}
var dialogs = (ctx) => composeDialog(ctx) + helpDialog() + labelDialog();
function embedded(ctx, { current, body }) {
  const c = ctx.counts ?? {};
  const tab = ([k, href, label]) => `<a href="${href}"${current === k ? ' aria-current="page"' : ""}>${esc(label)}${c[k] ? `<span class="ui-badge${k === "needs_you" || k === "approvals" ? "" : " is-quiet"}">${c[k]}</span>` : ""}</a>`;
  return `<div class="mail mail-embedded"><div class="app-nav"><nav class="ui-tabs" aria-label="Email">${[...NAV, ...LOW].map(tab).join("")}</nav><button type="button" class="ui-btn is-accent is-sm" data-tool="none" data-why="Opens the compose window" data-ui="compose">${icon("compose", 15)}<span>Compose</span></button></div>
<div class="ui-page">${body}</div>${dialogs(ctx)}<script type="application/json" class="keys">${JSON.stringify(KEYS).replace(/</g, "\\u003c")}<\/script></div>`;
}
function composeDialog(ctx) {
  return `<dialog class="ui-dialog compose" id="compose" aria-label="New email">
<form data-tool="email.send" data-after="reload" class="compose-f">
  <div class="dlg-h"><h3>New email</h3><button type="button" class="ui-x" data-tool="none" data-why="Closes this window" data-ui="close" aria-label="Close">\xD7</button></div>
  <label class="ui-field"><span>To</span><input class="ui-input" name="to" data-list autocomplete="off" placeholder="name@example.com, another@example.com" required></label>
  <label class="ui-field"><span>Subject</span><input class="ui-input" name="subject" autocomplete="off"></label>
  <label class="ui-field"><span>Message</span><textarea class="ui-textarea" name="body" rows="8" placeholder="Write, or say what you want and press Write with AI"></textarea></label>
  <p class="ui-hint">${ctx.outsideNeedsYes ? "Sending outside the team from an agent always waits for your yes. You pressing Send is that yes." : "Agents may send outside the team without asking (changed in Settings)."}</p>
  <div class="ui-dialog-a"><button type="submit" class="ui-btn is-ghost" data-tool="email.draft" data-ai data-after="stay" data-fill="body">${icon("spark", 15)}Write with AI</button><button type="submit" class="ui-btn is-quiet" data-tool="email.draft" data-after="reload">Save draft</button><button type="submit" class="ui-btn is-accent" data-tool="email.send">Send <span class="ui-kbd">\u2318\u21B5</span></button></div>
</form></dialog>`;
}
function helpDialog() {
  return `<dialog class="ui-dialog keys-dlg" id="help" aria-label="Keyboard shortcuts"><div class="dlg-h"><h3>Keyboard</h3><button type="button" class="ui-x" data-tool="none" data-why="Closes this window" data-ui="close" aria-label="Close">\xD7</button></div>
<dl class="ui-kv keys">${KEYS.map(([k, label]) => `<dt>${k.split(" ").map((x) => `<span class="ui-kbd">${esc(x.replace("Mod", "\u2318").replace("Shift+", "\u21E7"))}</span>`).join(" then ")}</dt><dd>${esc(label)}</dd>`).join("")}</dl>
<p class="ui-hint">Every key runs the same tool an agent can call. Nothing here is a private shortcut.</p></dialog>`;
}
function labelDialog() {
  return `<dialog class="ui-dialog" id="label" aria-label="Label"><form data-tool="email.label" data-after="reload"><div class="dlg-h"><h3>Label</h3><button type="button" class="ui-x" data-tool="none" data-why="Closes this window" data-ui="close" aria-label="Close">\xD7</button></div>
<input type="hidden" name="thread_id" data-current-thread><label class="ui-field"><span>Add labels</span><input class="ui-input" name="add" data-list placeholder="billing, lab"></label>
<div class="ui-dialog-a"><button type="submit" class="ui-btn is-accent" data-tool="email.label">Save</button></div></form></dialog>`;
}
var VIEW_TITLE = { needs_you: "Needs you", fyi: "FYI", news: "Newsletters", all: "All mail", snoozed: "Snoozed", archived: "Archived", search: "Search" };
var VIEW_SUB = {
  needs_you: "People waiting on a reply or an action from you.",
  fyi: "Worth knowing. Nothing to do.",
  news: "Newsletters and mailing lists.",
  all: "Everything in the inbox.",
  snoozed: "Back in the inbox when their time comes.",
  archived: "Out of the way, still searchable."
};
function renderInbox(ctx, { view, threads, q = "", account }) {
  const rows = threads.map((t) => {
    const from = t.participants.find((p) => p.address !== account) ?? t.participants[0];
    return `<li class="ui-inbox-i${t.unread ? " is-unread" : ""}" data-row data-thread="${esc(t.id)}" data-href="/t/${esc(t.id)}" tabindex="-1">
  ${avatar(from)}
  <a class="row-main" href="/t/${esc(t.id)}"><div class="ui-inbox-h"><b>${who(from)}</b>${t.message_count > 1 ? `<span class="mute">${t.message_count}</span>` : ""}${t.labels.map((l) => `<span class="ui-chip is-outline">${esc(l)}</span>`).join("")}</div><div class="ui-inbox-s">${esc(t.subject)}</div><div class="ui-inbox-p">${esc(t.snippet)}</div></a>
  <div class="ui-inbox-m"><time>${esc(when(t.last_at))}</time>${view === "all" || view === "search" ? `<span class="ui-chip${t.triage === "needs_you" ? " is-soft" : ""}">${esc(BUCKET_LABEL[t.triage])}</span>` : ""}
    <span class="row-a">${view === "archived" ? `<button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="email.archive" data-input="${attrJson({ thread_id: t.id, archived: false })}" data-after="remove" title="Move to inbox" aria-label="Move to inbox">${icon("needs", 15)}</button>` : `<button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="email.archive" data-input="${attrJson({ thread_id: t.id })}" data-after="remove" data-undo="${attrJson({ thread_id: t.id, archived: false })}" title="Archive (e)" aria-label="Archive">${icon("archive", 15)}</button><button type="button" class="ui-btn is-ghost is-icon is-sm" data-tool="email.snooze" data-input="${attrJson({ thread_id: t.id, until: "tomorrow" })}" data-after="remove" title="Snooze until tomorrow (h)" aria-label="Snooze until tomorrow">${icon("snooze", 15)}</button>`}</span></div>
</li>`;
  }).join("");
  const empty = view === "needs_you" ? `<div class="zero">${icon("spark", 22)}<h2>Nothing needs you.</h2><p>Everything waiting on you is handled. FYI and newsletters are one key away: <span class="ui-kbd">g</span> <span class="ui-kbd">f</span>.</p></div>` : `<div class="zero"><h2>${q ? `Nothing matches "${esc(q)}".` : "Nothing here."}</h2></div>`;
  const body = `
<div class="ui-ph"><div><h1>${esc(view === "search" ? `Search: ${q}` : VIEW_TITLE[view])}</h1><p>${esc(view === "search" ? `${threads.length} found, archived mail included.` : VIEW_SUB[view])}${account ? ` <span class="mute">${esc(account)}</span>` : ""}</p></div>
<div class="ph-a"><button type="button" class="ui-btn is-quiet is-sm" data-tool="email.sync" data-input="{}" data-after="reload" title="Check for new mail (s)">${icon("sync", 15)}<span>Check mail</span></button></div></div>
<form class="ui-search inbox-search" role="search" data-tool="email.search" data-nav="/search">${icon("search", 15)}<input type="search" name="q" value="${esc(q)}" placeholder="Search all mail" aria-label="Search all mail" data-search><span class="ui-kbd">/</span></form>
${["needs_you", "fyi", "news", "all"].includes(view) ? `<nav class="ui-tabs split" aria-label="Split inbox">${[["needs_you", "/", "1"], ["fyi", "/inbox/fyi", "2"], ["news", "/inbox/news", "3"], ["all", "/inbox/all", ""]].map(([k, href]) => `<a href="${href}"${k === view ? ' aria-current="page"' : ""}>${esc(VIEW_TITLE[k])}${ctx.counts?.[k] ? `<span class="ui-badge${k === "needs_you" ? "" : " is-quiet"}">${ctx.counts[k]}</span>` : ""}</a>`).join("")}</nav>` : ""}
<div class="ui-card flush"><ul class="ui-inbox" data-list>${rows || `<li class="empty-li">${empty}</li>`}</ul></div>
<p class="foot-keys"><span class="ui-kbd">j</span><span class="ui-kbd">k</span> move \xB7 <span class="ui-kbd">e</span> archive \xB7 <span class="ui-kbd">h</span> snooze \xB7 <span class="ui-kbd">c</span> compose \xB7 <button type="button" class="linkish" data-tool="none" data-why="Shows the keyboard shortcuts" data-ui="help">all shortcuts</button></p>`;
  return (ctx.wrap ?? layout)(ctx, { title: view === "search" ? "Search" : VIEW_TITLE[view], current: view, body });
}
function renderThread(ctx, { thread: t, messages, drafts }, { back = "/" } = {}) {
  const draft = drafts[drafts.length - 1];
  const msgs = messages.map((m, i) => `<article class="msg${i === messages.length - 1 ? " is-last" : ""}${m.direction === "out" ? " is-mine" : ""}">
  <header>${avatar(m.from, "")}<div class="msg-who"><b>${who(m.from)}</b> <span class="mute">&lt;${esc(m.from.address)}&gt;</span><small>to ${esc(m.to.map((x) => x.name || x.address).join(", "))}${m.cc.length ? `, cc ${esc(m.cc.map((x) => x.name || x.address).join(", "))}` : ""}</small></div><time>${esc(new Date(m.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }))}</time></header>
  <div class="msg-b">${esc(m.text).replace(/\n/g, "<br>")}</div>
  ${m.attachments.length ? `<div class="msg-files">${m.attachments.map((a) => `<span class="ui-chip is-outline">${esc(a.filename)}</span>`).join("")}</div>` : ""}
</article>`).join("");
  const waiting = draft?.status === "waiting";
  const body = `
<div class="thread" data-thread-page data-thread="${esc(t.id)}">
<div class="thread-bar">
  <a class="ui-btn is-ghost is-sm" href="${esc(back)}" data-back>${icon("back", 15)}<span>Back</span></a>
  <div class="thread-acts">
    <button type="button" class="ui-btn is-quiet is-sm" data-tool="email.archive" data-input="${attrJson({ thread_id: t.id, archived: !t.archived })}" data-after="back">${icon("archive", 15)}<span>${t.archived ? "Move to inbox" : "Archive"}</span><span class="ui-kbd">E</span></button>
    <button type="button" class="ui-btn is-quiet is-sm" data-tool="email.snooze" data-input="${attrJson({ thread_id: t.id, until: "tomorrow" })}" data-after="back">${icon("snooze", 15)}<span>Snooze</span><span class="ui-kbd">H</span></button>
    <button type="button" class="ui-btn is-ghost is-sm" data-tool="email.mark_read" data-input="${attrJson({ thread_id: t.id, read: false })}" data-after="back"><span>Unread</span><span class="ui-kbd">U</span></button>
    <button type="button" class="ui-btn is-ghost is-sm" data-tool="none" data-why="Opens the label window; Save there calls email.label" data-ui="label"><span>Label</span><span class="ui-kbd">L</span></button>
    <button type="button" class="ui-btn is-ghost is-sm is-danger-text" data-tool="email.delete_thread" data-input="${attrJson({ thread_id: t.id })}" data-confirm="Delete this conversation? It moves to your mailbox's trash." data-after="back" aria-label="Delete">${icon("trash", 15)}</button>
  </div>
</div>
<div class="ui-ph thread-h"><div><h1>${esc(t.subject)}</h1><p><span class="ui-seg triage-seg" role="group" aria-label="Sort into">${["needs_you", "fyi", "news"].map((b, i) => `<button type="button" aria-pressed="${t.triage === b}" data-tool="email.triage" data-input="${attrJson({ thread_id: t.id, bucket: b })}" data-after="reload" title="${i + 1}">${esc(BUCKET_LABEL[b])}</button>`).join("")}</span> <span class="mute why">${esc(t.triage_reason ?? "")}${t.triage_by === "model" ? " (AI)" : ""}</span>${t.labels.map((l) => ` <span class="ui-chip is-outline">${esc(l)}</span>`).join("")}</p></div></div>
<div class="msgs">${msgs}</div>
${waiting ? `<section class="ui-decide"><div><span class="ui-label">Waiting for a yes</span><p>A draft to someone outside the team is waiting for approval.</p></div><div class="ui-decide-a"><a class="ui-btn is-accent is-sm" href="/approvals">Review</a></div></section>` : ""}
<form class="reply" id="reply" data-tool="email.send" data-after="reload">
  <input type="hidden" name="thread_id" value="${esc(t.id)}">
  ${draft ? `<input type="hidden" name="draft_id" value="${esc(draft.id)}">` : ""}
  <div class="reply-h"><span class="ui-label">Reply to ${esc((draft?.to ?? []).join(", ") || who(messages.filter((m) => m.direction === "in").pop()?.from))}</span>${draft ? `<span class="ui-chip${draft.written_by === "agent" ? " is-soft" : ""}">${draft.written_by === "agent" ? "Written by AI, not sent" : "Draft"}</span>` : ""}</div>
  <textarea class="ui-textarea" name="body" rows="${draft ? 8 : 4}" placeholder="Write a reply, or type what it should say and press Write with AI" data-reply>${esc(draft?.body ?? "")}</textarea>
  <div class="reply-a">
    <button type="submit" class="ui-btn is-ghost is-sm" data-tool="email.draft" data-ai data-after="reload" title="d">${icon("spark", 15)}<span>Write with AI</span><span class="ui-kbd">D</span></button>
    <button type="submit" class="ui-btn is-ghost is-sm" data-tool="email.draft" data-after="reload"><span>Save draft</span></button>
    ${draft ? `<button type="button" class="ui-btn is-ghost is-sm" data-tool="email.discard_draft" data-input="${attrJson({ draft_id: draft.id })}" data-after="reload"><span>Discard</span></button>` : ""}
    <button type="submit" class="ui-btn is-accent is-sm" data-tool="email.send"><span>Send</span><span class="ui-kbd">\u2318\u21B5</span></button>
  </div>
  <p class="ui-hint">The AI sees outside mail as untrusted text and cannot send anything. You send.</p>
</form>
</div>`;
  return (ctx.wrap ?? layout)(ctx, { title: t.subject, current: t.archived ? "archived" : t.triage, body });
}
function renderDrafts(ctx, { drafts }) {
  const body = `<div class="ui-ph"><div><h1>Drafts</h1><p>Not sent yet. Drafts an agent wrote wait here for you.</p></div></div>
<div class="ui-card flush"><ul class="ui-inbox">${drafts.map((d) => `<li class="ui-inbox-i" data-row ${d.thread_id ? `data-href="/t/${esc(d.thread_id)}"` : ""}>${avatar({ address: d.to[0] ?? "?" })}<a class="row-main" ${d.thread_id ? `href="/t/${esc(d.thread_id)}"` : ""}><div class="ui-inbox-h"><b>To ${esc(d.to.join(", ") || "nobody yet")}</b>${d.written_by === "agent" ? '<span class="ui-chip is-soft">AI</span>' : ""}${d.status === "waiting" ? '<span class="ui-chip is-warn">Waiting for a yes</span>' : ""}</div><div class="ui-inbox-s">${esc(d.subject || "(no subject)")}</div><div class="ui-inbox-p">${esc(d.body)}</div></a>
<div class="ui-inbox-m"><span class="row-a is-on"><button type="button" class="ui-btn is-quiet is-sm" data-tool="email.send" data-input="${attrJson({ draft_id: d.id })}" data-after="reload">Send</button><button type="button" class="ui-btn is-ghost is-sm" data-tool="email.discard_draft" data-input="${attrJson({ draft_id: d.id })}" data-after="remove">Discard</button></span></div></li>`).join("") || '<li class="empty-li"><div class="zero"><h2>No drafts.</h2></div></li>'}</ul></div>`;
  return (ctx.wrap ?? layout)(ctx, { title: "Drafts", current: "drafts", body });
}
function renderApprovals(ctx, { pending, past }) {
  const card = (a) => `<section class="ui-decide approval"><div><span class="ui-label">${esc(a.requested_kind === "agent" ? "An agent asks" : `Asked by email by ${a.requested_by ?? "a teammate"}`)} \xB7 ${esc(when(a.created_at))}</span><p>${esc(cap(a.summary))}</p><small class="mute">${esc(a.reason)}</small>${a.input?.draft_id ? draftPreview(ctx, a.input.draft_id) : ""}</div>
<div class="ui-decide-a"><button type="button" class="ui-btn is-accent is-sm" data-tool="email.decide_approval" data-input="${attrJson({ approval_id: a.id, decision: "approve" })}" data-after="reload">Approve</button><button type="button" class="ui-btn is-ghost is-sm" data-tool="email.decide_approval" data-input="${attrJson({ approval_id: a.id, decision: "deny" })}" data-after="reload">Deny</button></div></section>`;
  const body = `<div class="ui-ph"><div><h1>Approvals</h1><p>Agents and email commands can ask for anything. Sending outside the team and deleting wait here for a person's yes.</p></div></div>
<div class="stack">${pending.map(card).join("") || '<div class="ui-card zero"><h2>Nothing waiting.</h2><p>When an agent wants to send outside the team or delete something, it shows up here, and in your email if you use run by email.</p></div>'}</div>
${past.length ? `<h2 class="sec">Decided</h2><div class="ui-card flush"><table class="tbl"><tbody>${past.map((a) => `<tr><td>${esc(cap(a.summary))}</td><td><span class="ui-chip${a.status === "approved" ? " is-good" : ""}">${esc(a.status)}</span></td><td class="mute">${esc(a.decided_by ?? "")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  return (ctx.wrap ?? layout)(ctx, { title: "Approvals", current: "approvals", body });
}
var cap = (s) => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);
var draftPreview = (ctx, draftId) => {
  const d = ctx.draftsById?.get(draftId);
  return d ? `<blockquote class="preview"><small>To ${esc(d.to.join(", "))} \xB7 ${esc(d.subject)}</small>${esc(d.body).replace(/\n/g, "<br>")}</blockquote>` : "";
};
function renderByEmail(ctx, { settings, command, commands, alerts, apps }) {
  const addr = command?.address;
  const [local, domain] = (addr ?? "ops@your-team.example").split("@");
  const body = `<div class="ui-ph"><div><h1>Run by email</h1><p>Your team writes to one address. Verified mail from teammates is acted on; everything else is ignored.</p></div>
<div class="ph-a"><button type="button" class="ui-btn is-quiet is-sm" data-tool="email.poll_commands" data-input="{}" data-after="reload">${icon("sync", 15)}<span>Check now</span></button><button type="button" class="ui-btn is-quiet is-sm" data-tool="email.send_digest" data-input="${attrJson({ to: ctx.me.email })}" data-after="stay">Send me the digest</button></div></div>
<div class="grid2">
<div class="ui-card">
  <span class="ui-label">The team address</span>
  ${addr ? `<p class="big-addr">${esc(addr)}</p>` : '<p class="big-addr mute">Not set up yet</p><p><a href="/settings#commands">Connect a command mailbox</a> in Settings.</p>'}
  <dl class="ui-kv is-rows how">
    <dt>Anything</dt><dd>Write to <b>${esc(local)}@${esc(domain)}</b>: "search invoice", "inbox", "draft t_... say yes to Tuesday".</dd>
    <dt>One app</dt><dd>Write to <b>${esc(local)}+crm@${esc(domain)}</b> or start the subject with "crm:". Apps on now: ${apps.map((a) => `<span class="ui-chip is-outline">${esc(a)}</span>`).join(" ")}</dd>
    <dt>Answer alerts</dt><dd>Reply "yes", "no" or a number. The reply address is signed and works once.</dd>
    <dt>Deleting, outside sends</dt><dd>Never by reply. You get a signed link and press a button.</dd>
    <dt>Daily digest</dt><dd>${settings.digest_on ? `Every day at ${settings.digest_hour}:00 (${esc(settings.digest_tz)}).` : "Off."}</dd>
  </dl>
</div>
<div class="ui-card">
  <span class="ui-label">Who is believed</span>
  <p class="small">Only team members, and only when their mail passes ${settings.auth_policy === "strict" ? "<b>SPF, DKIM and DMARC</b>" : "<b>DMARC</b>"}. ${settings.trusted_authserv ? `Checks from <b>${esc(settings.trusted_authserv)}</b> are trusted; otherwise this server checks itself.` : "This server checks the signatures itself."}</p>
  <form data-tool="email.send_alert" data-after="reload" class="alert-f"><input type="hidden" name="to" value="${esc(ctx.me.email)}"><input type="hidden" name="title" value="Test alert"><input type="hidden" name="question" value="Did this reach you?"><input type="hidden" name="options" data-json value='["Yes","No"]'><input type="hidden" name="app" value="core">
  <button type="submit" class="ui-btn is-quiet is-sm" data-tool="email.send_alert">Send me a test alert</button><span class="ui-hint">Reply to it from your mailbox to answer.</span></form>
</div>
</div>
<h2 class="sec">What came in</h2>
<div class="ui-card flush"><table class="tbl"><thead><tr><th>When</th><th>From</th><th class="hide-sm">Subject</th><th>Checks</th><th>Result</th></tr></thead><tbody>${commands.map((c) => `<tr><td class="mute nowrap">${esc(when(c.at))}</td><td>${esc(c.from)}</td><td class="hide-sm">${esc(c.subject)}</td><td class="nowrap">${["spf", "dkim", "dmarc"].map((k) => `<span class="ck ${c.verified[k] === "pass" ? "ok" : "no"}" title="${k.toUpperCase()}: ${esc(c.verified[k] ?? "none")}">${k.toUpperCase()}</span>`).join("")}</td><td>${c.accepted ? `<span class="ui-chip is-good">Done</span> <span class="mute small">${esc((c.result ?? "").split("\n")[0].slice(0, 80))}</span>` : `<span class="ui-chip is-bad">Refused</span> <span class="mute small">${esc(c.reason ?? "")}</span>`}</td></tr>`).join("") || '<tr><td colspan="5" class="mute">Nothing yet.</td></tr>'}</tbody></table></div>
<h2 class="sec">Alerts sent</h2>
<div class="ui-card flush"><table class="tbl"><tbody>${alerts.map((a) => `<tr><td class="mute nowrap">${esc(when(a.created_at))}</td><td>${esc(a.title)}</td><td class="hide-sm">${esc(a.to)}</td><td>${a.status === "answered" ? `<span class="ui-chip is-good">${esc(a.answer)}</span>` : `<span class="ui-chip">${esc(a.status)}</span>`}</td></tr>`).join("") || '<tr><td class="mute">No alerts yet.</td></tr>'}</tbody></table></div>`;
  return (ctx.wrap ?? layout)(ctx, { title: "Run by email", current: "by-email", body });
}
function renderSettings(ctx, { accounts, settings, members, model }) {
  const admin = ["owner", "admin"].includes(ctx.me.role);
  const acctRow = (a) => `<li class="acct"><div><b>${esc(a.address)}</b><small class="mute">${a.purpose === "commands" ? "Team command address" : "Mailbox"} \xB7 ${esc(a.kind === "memory" ? "demo server" : "IMAP and SMTP")}${a.last_sync_at ? ` \xB7 checked ${esc(when(a.last_sync_at))}` : ""}</small>${a.last_error ? `<small class="err">${esc(a.last_error)}</small>` : ""}</div><button type="button" class="ui-btn is-ghost is-sm is-danger-text" data-tool="email.disconnect_account" data-input="${attrJson({ account_id: a.id })}" data-confirm="Disconnect ${esc(a.address)}? Its stored mail is removed from this app; nothing changes on your mail server." data-after="reload">Disconnect</button></li>`;
  const connect = (purpose) => `<form class="connect" data-tool="email.connect_account" data-after="reload"${purpose === "commands" ? ' id="commands"' : ""}>
  <input type="hidden" name="purpose" value="${purpose}">
  <div class="ui-fields f2">
    <label class="ui-field"><span>Address</span><input class="ui-input" name="address" type="email" required placeholder="${purpose === "commands" ? "ops@your-team.example" : "you@your-team.example"}"></label>
    <label class="ui-field"><span>Password <small>or app password</small></span><input class="ui-input" name="password" type="password" autocomplete="new-password" required></label>
    <label class="ui-field"><span>IMAP server</span><input class="ui-input" name="imap_host" placeholder="imap.fastmail.com" required></label>
    <label class="ui-field"><span>SMTP server</span><input class="ui-input" name="smtp_host" placeholder="smtp.fastmail.com" required></label>
  </div>
  <details class="more"><summary>Ports and login name</summary><div class="ui-fields f3"><label class="ui-field"><span>IMAP port</span><input class="ui-input" name="imap_port" type="number" placeholder="993"></label><label class="ui-field"><span>SMTP port</span><input class="ui-input" name="smtp_port" type="number" placeholder="465"></label><label class="ui-field"><span>Login name</span><input class="ui-input" name="username" placeholder="if not the address"></label></div></details>
  <div class="row"><button type="submit" class="ui-btn is-accent is-sm" data-tool="email.connect_account">Test and connect</button><span class="ui-hint">The password is tested, then stored encrypted with a key kept outside the database.</span></div>
</form>`;
  const rulesText = settings.rules.map((r) => `${r.from ? `from ${r.from}` : ""}${r.from && r.subject ? " and " : ""}${r.subject ? `subject ${r.subject}` : ""} -> ${r.triage}`).join("\n");
  const body = `<div class="ui-ph"><div><h1>Settings</h1><p>Mailboxes, sorting, safety and the team.</p></div><div class="ph-a"><button type="button" class="ui-btn is-quiet is-sm" data-tool="email.export" data-input="{}" data-after="download">Export everything</button></div></div>
<div class="stack">
<section class="ui-card"><div class="card-h"><h2>Your mailboxes</h2></div>
<ul class="accts">${accounts.filter((a) => a.purpose === "mailbox").map(acctRow).join("") || '<li class="mute">None yet.</li>'}</ul>
<details class="more"${accounts.some((a) => a.purpose === "mailbox") ? "" : " open"}><summary>Connect a mailbox</summary>${connect("mailbox")}<p class="ui-hint">Works with Fastmail, iCloud, your own server, and Gmail or Outlook with an app password. Gmail and Microsoft sign-in links come next.</p></details>
</section>

<section class="ui-card"><div class="card-h"><h2>Team command address</h2><a class="small" href="/by-email">How it works</a></div>
<ul class="accts">${accounts.filter((a) => a.purpose === "commands").map(acctRow).join("") || '<li class="mute">None yet. Use a mailbox only for this, like ops@ your domain.</li>'}</ul>
${admin && !accounts.some((a) => a.purpose === "commands") ? connect("commands") : ""}
</section>

<section class="ui-card"><div class="card-h"><h2>Sorting rules</h2></div>
<form data-tool="email.set_rules" data-after="reload"><label class="ui-field"><span>One rule per line <small>needs_you, fyi or news</small></span><textarea class="ui-textarea mono" name="rules" data-rules rows="4" placeholder="from *@news.example -> news&#10;subject invoice -> fyi">${esc(rulesText)}</textarea></label>
<div class="row"><button type="submit" class="ui-btn is-quiet is-sm" data-tool="email.set_rules">Save rules</button><span class="ui-hint">Rules come first. Then mailing-list headers, then ${model ? "the AI model" : "simple signals (connect a model for AI sorting)"}.</span></div></form>
</section>

<section class="ui-card"><div class="card-h"><h2>Safety and the digest</h2></div>
<form data-tool="email.update_settings" data-after="reload">
  <label class="ui-check"><input type="checkbox" name="send_outside_needs_yes" ${settings.send_outside_needs_yes ? "checked" : ""}${admin ? "" : " disabled"}><span>Agents need my yes to email anyone outside the team</span></label>
  <label class="ui-check"><input type="checkbox" name="run_by_email" ${settings.run_by_email ? "checked" : ""}${admin ? "" : " disabled"}><span>Run wOS by email</span></label>
  <label class="ui-check"><input type="checkbox" name="digest_on" ${settings.digest_on ? "checked" : ""}${admin ? "" : " disabled"}><span>Send a daily digest</span></label>
  <div class="ui-fields f3">
    <label class="ui-field"><span>Team domains</span><input class="ui-input" name="team_domains" data-list value="${esc(settings.team_domains.join(", "))}"${admin ? "" : " disabled"}></label>
    <label class="ui-field"><span>Digest hour</span><input class="ui-input" name="digest_hour" type="number" min="0" max="23" value="${settings.digest_hour}"${admin ? "" : " disabled"}></label>
    <label class="ui-field"><span>Time zone</span><input class="ui-input" name="digest_tz" value="${esc(settings.digest_tz)}"${admin ? "" : " disabled"}></label>
    <label class="ui-field"><span>Sender checks</span><select class="ui-select" name="auth_policy"${admin ? "" : " disabled"}><option value="strict"${settings.auth_policy === "strict" ? " selected" : ""}>SPF, DKIM and DMARC</option><option value="dmarc"${settings.auth_policy === "dmarc" ? " selected" : ""}>DMARC only</option></select></label>
    <label class="ui-field is-wide"><span>Trust checks from <small>optional</small></span><input class="ui-input" name="trusted_authserv" value="${esc(settings.trusted_authserv)}" placeholder="mx.your-provider.example"${admin ? "" : " disabled"}></label>
  </div>
  ${admin ? '<button type="submit" class="ui-btn is-quiet is-sm" data-tool="email.update_settings">Save</button>' : '<p class="ui-hint">Only an owner or admin can change these.</p>'}
</form>
</section>

<section class="ui-card"><div class="card-h"><h2>Team</h2></div>
<ul class="accts">${members.map((m) => `<li class="acct"><div><b>${esc(m.name)}</b><small class="mute">${esc(m.email)} \xB7 ${esc(m.role)}${m.github ? ` \xB7 @${esc(m.github)}` : ""}</small></div>${admin && m.email !== ctx.me.email ? `<button type="button" class="ui-btn is-ghost is-sm" data-tool="email.remove_member" data-input="${attrJson({ member_id: m.id })}" data-confirm="Take ${esc(m.name)} off the team?" data-after="reload">Remove</button>` : ""}</li>`).join("")}</ul>
${admin ? `<form data-tool="email.add_member" data-after="reload" class="add-member"><div class="ui-fields f3"><label class="ui-field"><span>Name</span><input class="ui-input" name="name"></label><label class="ui-field"><span>Email</span><input class="ui-input" name="email" type="email" required></label><label class="ui-field"><span>GitHub <small>optional</small></span><input class="ui-input" name="github"></label></div><button type="submit" class="ui-btn is-quiet is-sm" data-tool="email.add_member">Add teammate</button></form>` : ""}
</section>

<section class="ui-card selfhost-card"><div class="card-h"><h2>Host it yourself, free</h2></div>
<p>This app is open source (AGPL-3.0). Run it on your own server with <code>docker compose up</code>, point it at any Postgres with <code>DATABASE_URL</code>, and bring your own mailbox. <a href="${REPO}">The code and the steps</a>.</p>
<p class="ui-hint">Agents connect at <code>/mcp</code>. Every button here is also a tool: <a href="/tools.json">tools.json</a>.</p>
</section>
</div>`;
  return (ctx.wrap ?? layout)(ctx, { title: "Settings", current: "settings", body });
}

// lib/screen-data.mjs
var VIEWS = ["needs_you", "fyi", "news", "all", "snoozed", "archived"];
async function renderScreen(fullPath, call, ctx, { back = "/" } = {}) {
  const url = new URL(fullPath, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const [, a, b] = p.split("/");
  const settings = await call("email.get_settings", {});
  const accounts = (await call("email.list_accounts", {})).accounts;
  const first = await call("email.list_threads", { view: "needs_you", limit: 1 });
  const approvals = (await call("email.list_approvals", {})).approvals;
  const drafts = (await call("email.list_drafts", {})).drafts;
  const c = { ...ctx, outsideNeedsYes: settings.send_outside_needs_yes, counts: { ...first.counts ?? {}, approvals: approvals.length, drafts: drafts.length } };
  const mine = accounts.find((x) => x.purpose === "mailbox");
  if (p === "/" || a === "inbox" && b) {
    const view = p === "/" ? "needs_you" : b;
    if (!VIEWS.includes(view)) return null;
    const out = await call("email.list_threads", { view });
    return renderInbox(c, { view, threads: out.threads, account: mine?.address });
  }
  if (a === "search") {
    const q = url.searchParams.get("q") ?? "";
    const threads = q ? (await call("email.search", { q })).threads : [];
    return renderInbox(c, { view: "search", threads, q, account: mine?.address });
  }
  if (a === "t" && b) return renderThread(c, await call("email.read_thread", { thread_id: decodeURIComponent(b) }), { back });
  if (p === "/drafts") return renderDrafts(c, { drafts });
  if (p === "/approvals") {
    const past = (await call("email.list_approvals", { status: "all" })).approvals.filter((x) => x.status !== "pending").slice(0, 20);
    c.draftsById = new Map(drafts.map((d) => [d.id, d]));
    return renderApprovals(c, { pending: approvals, past });
  }
  if (p === "/by-email") {
    const log = await call("email.list_commands", {});
    return renderByEmail(c, { settings, command: accounts.find((x) => x.purpose === "commands"), commands: log.commands, alerts: (await call("email.list_alerts", {})).alerts, apps: log.apps ?? ["email"] });
  }
  if (p === "/settings") return renderSettings(c, { accounts, settings, members: (await call("email.list_members", {})).members, model: !!ctx.model });
  return null;
}
function notFound(ctx) {
  return (ctx.wrap ?? layout)(ctx, { title: "Not found", current: "", body: '<div class="ui-card zero"><h2>Not found</h2><p><a href="/">Back to the inbox</a></p></div>' });
}

// public/app/wire.mjs
function wire(root, io) {
  const doc = root.ownerDocument ?? root;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const off = [];
  const on = (target, ev, fn) => {
    target.addEventListener(ev, fn);
    off.push(() => target.removeEventListener(ev, fn));
  };
  function formInput(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled || el.type === "submit" || el.type === "button") continue;
      if (el.type === "checkbox") {
        out[el.name] = el.checked;
        continue;
      }
      const v = el.value.trim();
      if (v === "") continue;
      if (el.type === "number") out[el.name] = Number(v);
      else if (el.hasAttribute("data-json")) out[el.name] = JSON.parse(v);
      else if (el.hasAttribute("data-rules")) out[el.name] = parseRules(v);
      else out[el.name] = v;
    }
    if (form.querySelector("[data-rules]") && !out.rules) out.rules = [];
    return out;
  }
  async function run(el, name, input) {
    if (el?.dataset?.confirm && !confirm(el.dataset.confirm)) return;
    const busy = el?.closest?.("form") ?? el;
    busy?.classList?.add("is-busy");
    const out = await io.call(name, input);
    busy?.classList?.remove("is-busy");
    if (!out.ok) return io.toast(out.error || "That did not work");
    if (out.status === "needs_approval") return io.reload("Waiting for a yes. See Approvals.");
    const after = el?.dataset?.after ?? "reload";
    const first = String(out.text ?? "Done").split("\n")[0].replace(/\s*\((?:approval )?[a-z]{1,3}_[a-z2-9]{6,}\)/g, "");
    if (after === "remove") {
      const row = el.closest("[data-row]");
      const undo = el.dataset.undo ? { tool: name, input: JSON.parse(el.dataset.undo) } : null;
      if (row) {
        row.classList.add("is-gone");
        setTimeout(() => {
          const next = row.nextElementSibling;
          row.remove();
          select(next && next.matches("[data-row]") ? rows().indexOf(next) : sel - 1);
        }, 160);
      }
      return io.toast(first, undo);
    }
    if (after === "back") return io.back(first);
    if (after === "download") {
      const blob = new Blob([JSON.stringify(out.result, null, 2)], { type: "application/json" });
      const a = Object.assign(doc.createElement("a"), { href: URL.createObjectURL(blob), download: `email-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json` });
      doc.body.append(a);
      a.click();
      a.remove();
      return io.toast(first);
    }
    if (after === "stay") {
      const f = el.closest("form");
      const fill = el.dataset.fill && f?.querySelector(`[name="${el.dataset.fill}"]`);
      if (fill && out.result?.body != null) {
        fill.value = out.result.body;
        let h = f.querySelector('input[name="draft_id"]');
        if (!h) {
          h = Object.assign(doc.createElement("input"), { type: "hidden", name: "draft_id" });
          f.append(h);
        }
        h.value = out.result.id;
      }
      return io.toast(first);
    }
    return io.reload(first);
  }
  on(root, "click", (e) => {
    const el = e.target.closest("button[data-tool]:not([data-tool=none]):not([type=submit])");
    if (el) {
      e.preventDefault();
      return run(el, el.dataset.tool, JSON.parse(el.dataset.input || "{}"));
    }
    const ui = e.target.closest("[data-ui]");
    if (ui) {
      const what = ui.dataset.ui;
      if (what === "compose") openDialog("compose");
      else if (what === "help") openDialog("help");
      else if (what === "label") openLabel();
      else if (what === "search") focusSearch();
      else if (what === "close") ui.closest("dialog")?.close();
      return;
    }
    const row = e.target.closest("[data-row][data-href]");
    if (row && !e.target.closest("a,button")) return io.go(row.dataset.href);
    const back = e.target.closest("a[data-back]");
    if (back) {
      e.preventDefault();
      return io.back();
    }
    const link = e.target.closest('a[href^="/"]');
    if (link && io.links && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      io.go(link.getAttribute("href"));
    }
  });
  on(root, "submit", (e) => {
    const form = e.target.closest("form[data-tool]");
    if (!form) return;
    e.preventDefault();
    const btn = e.submitter?.dataset.tool ? e.submitter : form;
    const input = formInput(form);
    if (form.dataset.nav) {
      if (input.q) io.go(`${form.dataset.nav}?q=${encodeURIComponent(input.q)}`);
      return;
    }
    if (btn.hasAttribute?.("data-ai")) {
      if (input.body) {
        input.instructions = input.body;
        delete input.body;
      }
      input.ai = true;
    }
    if (btn !== form && !btn.dataset.after && form.dataset.after) btn.dataset.after = form.dataset.after;
    run(btn, btn.dataset.tool, input);
  });
  function openDialog(id) {
    const d = $(`#${id}`);
    if (d && !d.open) {
      d.showModal();
      d.querySelector("input:not([type=hidden]),textarea")?.focus();
    }
  }
  function openLabel() {
    const id = currentThread();
    if (!id) return io.toast("Pick a conversation first");
    $("#label [data-current-thread]").value = id;
    openDialog("label");
  }
  function focusSearch() {
    const s = $("[data-search]");
    if (s && s.offsetParent) {
      s.focus();
      s.select();
    } else io.go("/search");
  }
  const rows = () => $$("[data-row]");
  let sel = -1;
  function select(i) {
    const r = rows();
    if (!r.length) {
      sel = -1;
      return;
    }
    sel = Math.max(0, Math.min(i, r.length - 1));
    r.forEach((x, j) => x.setAttribute("aria-current", j === sel ? "true" : "false"));
    r[sel].scrollIntoView?.({ block: "nearest" });
  }
  const threadPage = () => $("[data-thread-page]");
  const currentThread = () => threadPage()?.dataset.thread ?? rows()[sel]?.dataset.thread;
  const press = (s) => {
    const b = $(s);
    if (b) b.click();
    return !!b;
  };
  const rowButton = (tool) => rows()[sel]?.querySelector(`button[data-tool="${tool}"]`);
  let pending = "";
  let pendingTimer;
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  on(doc, "keydown", (e) => {
    if (!root.isConnected && root !== doc) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      const form = e.target.closest?.("form") ?? $("dialog[open] form") ?? $("#reply");
      const send = form?.querySelector('button[data-tool="email.send"]');
      if (send) {
        e.preventDefault();
        form.requestSubmit(send);
      }
      return;
    }
    if (e.key === "Escape") {
      if ($("dialog[open]")) return;
      if (typing(e.target)) return e.target.blur();
      if (threadPage()) return io.back();
      return;
    }
    if (typing(e.target) || mod || e.altKey) return;
    const k = e.key;
    if (pending === "g") {
      pending = "";
      const go = { i: "/", f: "/inbox/fyi", n: "/inbox/news", a: "/inbox/all", d: "/drafts", y: "/approvals" }[k];
      if (go) {
        e.preventDefault();
        io.go(go);
      }
      return;
    }
    if (k === "g") {
      pending = "g";
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => pending = "", 900);
      return;
    }
    const id = currentThread();
    const open = () => {
      const r = rows()[sel];
      if (r?.dataset.href) io.go(r.dataset.href);
    };
    const act = {
      j: () => select(sel + 1),
      ArrowDown: () => select(sel + 1),
      k: () => select(sel - 1),
      ArrowUp: () => select(sel - 1),
      Enter: open,
      o: open,
      e: () => threadPage() ? press('.thread-acts [data-tool="email.archive"]') : rowButton("email.archive")?.click(),
      E: () => id && run(null, "email.archive", { thread_id: id, archived: false }),
      h: () => threadPage() ? press('.thread-acts [data-tool="email.snooze"]') : rowButton("email.snooze")?.click(),
      u: () => id && run(threadPage() ? $('.thread-acts [data-tool="email.mark_read"]') : null, "email.mark_read", { thread_id: id, read: false }),
      "#": () => threadPage() ? press('.thread-acts [data-tool="email.delete_thread"]') : id && confirm("Delete this conversation?") && run(null, "email.delete_thread", { thread_id: id }),
      1: () => id && run(null, "email.triage", { thread_id: id, bucket: "needs_you" }),
      2: () => id && run(null, "email.triage", { thread_id: id, bucket: "fyi" }),
      3: () => id && run(null, "email.triage", { thread_id: id, bucket: "news" }),
      l: () => openLabel(),
      r: () => {
        const t = $("[data-reply]");
        if (t) {
          t.focus();
          t.scrollIntoView?.({ block: "center" });
        } else if (rows()[sel]) io.go(`${rows()[sel].dataset.href}#reply`);
      },
      d: () => {
        const f = $("#reply");
        const b = f?.querySelector("[data-ai]");
        if (b) f.requestSubmit(b);
      },
      c: () => openDialog("compose"),
      "/": () => focusSearch(),
      s: () => press('[data-tool="email.sync"]') || run(null, "email.sync", {}),
      "?": () => openDialog("help")
    }[k];
    if (act) {
      e.preventDefault();
      act();
    }
  });
  if (rows().length && !threadPage()) select(0);
  return () => {
    for (const f of off) f();
    clearTimeout(pendingTimer);
  };
}
function parseRules(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [lhs, rhs] = l.split("->").map((s) => (s ?? "").trim());
    const r = { triage: (rhs || "fyi").toLowerCase().replace(/\s+/g, "_").replace("newsletters", "news") };
    const from = /from\s+(\S+)/i.exec(lhs)?.[1];
    const subject = /subject\s+(.+?)(\s+and\s+|$)/i.exec(lhs)?.[1];
    if (from) r.from = from;
    if (subject) r.subject = subject;
    return r;
  });
}

// public/app/email.css
var email_default = "/* wOS Email \xB7 the few pieces the ui-design kit does not have yet. Kit tokens (--ui-*) only, so every\n   scheme and mode restyles these too. The kit itself (public/ui) is synced, never edited. */\n\nhtml{background:var(--ui-bg)}\nbody.mail{font-size:14px}\na{color:inherit}\n.mute{color:var(--ui-ink-3)}.small{font-size:12.5px}.nowrap{white-space:nowrap}\ncode{font-family:var(--ui-mono);font-size:.92em}\n.mark{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:var(--ui-radius-sm);background:var(--ui-accent);color:var(--ui-on-accent)}\n.compose-btn{margin:0 4px var(--ui-s4);justify-content:flex-start;gap:10px}\n.compose-btn .ui-kbd{margin-left:auto}\n.selfhost{display:block;margin:10px 10px 0;font-size:12px;color:var(--ui-ink-3);text-decoration:none}\n.selfhost:hover{color:var(--ui-ink)}\n.ui-page.is-wide{width:100%;max-width:1400px}\n.ui-page{width:min(980px,100%)}\n.ph-a{display:flex;gap:var(--ui-s2);flex-wrap:wrap}\n.demo-note{margin:0 0 var(--ui-s5);font-size:13.5px;align-items:center;line-height:1.5}\n.demo-note .ui-chip{flex:none}\n\n/* ---- inside the suite ---- */\n.mail-embedded .app-nav{display:flex;align-items:center;gap:var(--ui-s3);justify-content:space-between;padding:0 clamp(16px,3vw,28px);border-bottom:1px solid var(--ui-line)}\n.mail-embedded .app-nav .ui-tabs{border-bottom:0;flex:1;min-width:0}\n.mail-embedded .ui-page{width:min(980px,100%)}\n\n/* ---- inbox ---- */\n.inbox-search{margin:0 0 var(--ui-s3)}\n.inbox-search .ui-kbd{flex:none}\n.split{margin:0 0 var(--ui-s4)}\n.split .ui-badge{margin-left:6px}\n.ui-card.flush{padding:0;overflow:hidden}\n.ui-inbox .ui-inbox-i:last-child{border-bottom:0}\n.ui-inbox-i{grid-template-columns:auto minmax(0,1fr) auto;outline:0}\n.ui-inbox-i .row-main{display:block;min-width:0;text-decoration:none;color:inherit}\n.ui-inbox-i .row-main:focus-visible{outline:2px solid var(--ui-accent-line);outline-offset:4px;border-radius:4px}\n.ui-inbox-h .mute{font-size:12px}\n.ui-inbox-h .ui-chip{line-height:18px;font-size:11px}\n.ui-inbox-m{min-height:44px}\n.row-a{display:flex;gap:2px;opacity:0;transition:opacity var(--ui-dur) var(--ui-ease)}\n.ui-inbox-i:hover .row-a,.ui-inbox-i[aria-current=true] .row-a,.row-a.is-on,.row-a:focus-within{opacity:1}\n.ui-inbox-i.is-gone{opacity:0;transform:translateX(12px);transition:opacity .16s,transform .16s}\n.empty-li{list-style:none}\n.zero{padding:var(--ui-s8) var(--ui-s5);text-align:center;color:var(--ui-ink-2)}\n.zero svg{color:var(--ui-accent)}\n.zero h2{margin:var(--ui-s2) 0 var(--ui-s1);font-family:var(--ui-display);font-size:19px;letter-spacing:calc(var(--ui-display-track) / 2);color:var(--ui-ink)}\n.zero p{margin:0 auto;max-width:44ch;line-height:1.55}\n.foot-keys{margin:var(--ui-s4) 0 0;font-size:12.5px;color:var(--ui-ink-3);display:flex;flex-wrap:wrap;gap:6px;align-items:center}\n.linkish{font:inherit;color:var(--ui-ink-2);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}\n\n/* ---- a thread ---- */\n.thread-bar{display:flex;align-items:center;justify-content:space-between;gap:var(--ui-s2);margin:0 0 var(--ui-s4);position:sticky;top:0;z-index:4;padding:8px 0;background:color-mix(in srgb,var(--ui-bg) 88%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}\n.thread-acts{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}\n.thread-acts .ui-kbd{margin-left:2px}\n.is-danger-text{color:var(--ui-bad)}\n.thread-h h1{font-size:clamp(20px,2vw,26px)}\n.thread-h p{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.triage-seg button{font-size:12.5px;padding:4px 10px}\n.why{font-size:12.5px}\n.msgs{display:grid;gap:var(--ui-s3)}\n.msg{background:var(--ui-card);border:1px solid var(--ui-card-line);border-radius:var(--ui-radius);padding:var(--ui-s4) var(--ui-s5)}\n.msg.is-mine{background:var(--ui-surface-2)}\n.msg header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:start}\n.msg-who{min-width:0;font-size:14px}\n.msg-who .mute{font-size:12.5px}\n.msg-who small{display:block;color:var(--ui-ink-3);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.msg time{font-size:12px;color:var(--ui-ink-3);white-space:nowrap}\n.msg-b{margin:var(--ui-s3) 0 0 36px;line-height:1.62;font-size:14.5px;overflow-wrap:anywhere;color:var(--ui-ink)}\n.msg-files{margin:var(--ui-s3) 0 0 36px;display:flex;gap:6px;flex-wrap:wrap}\n.reply{margin-top:var(--ui-s4);background:var(--ui-card);border:1px solid var(--ui-accent-line);border-radius:var(--ui-radius);padding:var(--ui-s4)}\n.reply-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:var(--ui-s2)}\n.reply .ui-textarea{width:100%;min-height:96px;resize:vertical;line-height:1.55}\n.reply-a{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-top:var(--ui-s2)}\n.reply-a .ui-btn.is-accent{margin-left:auto}\n.reply .ui-hint{margin:var(--ui-s2) 0 0}\n.ui-decide{margin-top:var(--ui-s4)}\n.is-busy{opacity:.55;pointer-events:none}\n\n/* ---- dialogs ---- */\n.ui-dialog.compose{width:min(620px,calc(100% - 24px))}\n.dlg-h{display:flex;align-items:center;justify-content:space-between;margin:0 0 var(--ui-s3)}\n.dlg-h h3{margin:0}\n.compose .ui-textarea{width:100%;resize:vertical;line-height:1.55}\n.compose .ui-dialog-a{flex-wrap:wrap}\n.keys{grid-template-columns:auto 1fr;gap:8px 18px;font-size:13.5px}\n.keys dt{white-space:nowrap}\n.keys-dlg{width:min(540px,calc(100% - 24px));max-height:86svh;overflow:auto}\n\n/* ---- approvals, run by email, settings ---- */\n.stack{display:grid;gap:var(--ui-s4)}\n.approval small{display:block;margin-top:4px}\n.preview{margin:var(--ui-s3) 0 0;padding:var(--ui-s3);border-left:2px solid var(--ui-accent-line);background:var(--ui-surface);font-size:13.5px;line-height:1.55;color:var(--ui-ink-2)}\n.preview small{display:block;color:var(--ui-ink-3);margin-bottom:6px}\n.sec{font-size:15px;font-weight:600;margin:var(--ui-s6) 0 var(--ui-s3)}\n.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-s4)}\n.big-addr{font-family:var(--ui-mono);font-size:18px;margin:6px 0 var(--ui-s4);overflow-wrap:anywhere}\n.how{font-size:13.5px;line-height:1.5}\n.how dt{color:var(--ui-ink-2);font-weight:500;margin-top:10px}\n.how .ui-chip{margin-right:4px}\n.alert-f{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:var(--ui-s3)}\n.tbl{width:100%;border-collapse:collapse;font-size:13.5px}\n.tbl th{text-align:left;font-weight:500;font-size:12px;color:var(--ui-ink-3);padding:10px 14px;border-bottom:1px solid var(--ui-line)}\n.tbl td{padding:10px 14px;border-bottom:1px solid var(--ui-line);vertical-align:top}\n.tbl tr:last-child td{border-bottom:0}\n.ck{display:inline-block;font:600 10px/1 var(--ui-mono);padding:3px 5px;margin-right:3px;border-radius:var(--ui-radius-xs)}\n.ck.ok{background:color-mix(in srgb,var(--ui-good) 18%,transparent);color:color-mix(in oklab,var(--ui-good) 60%,var(--ui-ink))}\n.ck.no{background:transparent;box-shadow:inset 0 0 0 1px var(--ui-line-2);color:var(--ui-ink-3);text-decoration:line-through}\n.card-h{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 var(--ui-s3)}\n.card-h h2{margin:0;font-size:15px;font-weight:600}\n.accts{list-style:none;margin:0 0 var(--ui-s3);padding:0;display:grid}\n.acct{display:flex;align-items:center;justify-content:space-between;gap:var(--ui-s3);padding:10px 0;border-bottom:1px solid var(--ui-line)}\n.acct:last-child{border-bottom:0}\n.acct small{display:block;font-size:12.5px;margin-top:2px}\n.acct .err{color:var(--ui-bad)}\n.more summary{cursor:pointer;color:var(--ui-ink-2);font-size:13.5px;margin:var(--ui-s2) 0}\n.more[open] summary{margin-bottom:var(--ui-s3)}\n.ui-fields.f2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 var(--ui-s3)}\n.ui-fields.f3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 var(--ui-s3)}\n.ui-fields .is-wide{grid-column:1/-1}\n.row{display:flex;align-items:center;gap:var(--ui-s3);flex-wrap:wrap}\n.mono{font-family:var(--ui-mono);font-size:13px}\n.ui-check{display:flex;align-items:center;gap:10px;margin:0 0 var(--ui-s3);font-size:14px}\n.selfhost-card p{margin:0 0 var(--ui-s2);line-height:1.55;color:var(--ui-ink-2)}\n\n/* ---- sign-in and signed links ---- */\nbody.gate{display:grid;place-items:center;min-height:100svh;padding:16px;margin:0}\n.ui-gate{width:min(400px,100%);text-align:center}\n.ui-gate form{margin-top:var(--ui-s4);text-align:left}\n.ui-gate .ui-hint{margin-top:var(--ui-s4)}\n.gate-mark{display:inline-block;width:34px;height:34px;border-radius:var(--ui-radius);background:var(--ui-accent)}\n.gate-card{width:min(400px,100%);background:var(--ui-surface);border:1px solid var(--ui-line-2);border-radius:var(--ui-radius-lg);padding:30px 26px;text-align:center}\n\n/* ---- phone ---- */\n@media (max-width:900px){\n  .ui-topbar>.ui-btn:first-of-type{margin-left:auto}\n  .ui-topbar>:last-child{margin-left:0}\n}\n@media (max-width:700px){\n  .grid2,.ui-fields.f2,.ui-fields.f3{grid-template-columns:1fr}\n  .thread-acts .ui-btn:has(svg) span:not(.ui-kbd),.thread-acts .ui-kbd,.reply-a .ui-kbd,.inbox-search .ui-kbd,.compose .ui-kbd{display:none}\n  .thread-bar{margin-left:-4px;margin-right:-4px}\n  .msg{padding:var(--ui-s3) var(--ui-s4)}\n  .msg-b,.msg-files{margin-left:0}\n  .row-a{opacity:1}\n  .ui-inbox-i{padding:12px 12px 12px 16px}\n  .ui-inbox-m .row-a{display:none}\n  .row-a.is-on{display:flex}\n  .foot-keys{display:none}\n  .hide-sm{display:none}\n  .tbl td,.tbl th{padding:9px 10px}\n  .ui-dialog.compose{margin:auto 0 0;width:100%;max-width:100%;border-radius:var(--ui-radius-lg) var(--ui-radius-lg) 0 0;padding:var(--ui-s5)}\n}\n";

// screens/index.mjs
var LIVE = ["email.message.received", "email.message.sent", "email.command.received", "email.alert.answered"];
var index_default = {
  title: "Email",
  mount(el, ctx) {
    const doc = el.ownerDocument;
    if (!doc.getElementById("wos-email-style")) doc.head.append(Object.assign(doc.createElement("style"), { id: "wos-email-style", textContent: email_default }));
    let path = ctx.path || "/";
    const history = [];
    let unwire = null;
    let drawing = 0;
    let alive = true;
    const call = async (name, input) => {
      try {
        const r = await ctx.callTool(name, input);
        if (r && r.pending) return { ok: true, status: "needs_approval", text: r.pending.message, pending: r.pending };
        return { ok: true, status: "done", result: r, text: r?.summary };
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    };
    const result = async (name, input) => {
      const o = await call(name, input);
      if (!o.ok) throw new Error(o.error);
      return o.result;
    };
    const me = { role: "owner", ...ctx.me, email: ctx.me?.email ?? "" };
    async function draw(message) {
      const n = ++drawing;
      let html;
      try {
        html = await renderScreen(path, result, { me, name: "Email", wrap: embedded, version: "" }, { back: history.at(-1) ?? "/" }) ?? notFound({ me, wrap: embedded });
      } catch (e) {
        html = embedded({ me }, { body: `<div class="ui-notice is-quiet">${String(e.message).replace(/</g, "&lt;")}</div>` });
      }
      if (!alive || n !== drawing) return;
      unwire?.();
      el.innerHTML = html;
      unwire = wire(el, io);
      if (message) ctx.toast(message);
    }
    const go = (p) => {
      history.push(path);
      path = p;
      ctx.navigate?.(p);
      draw();
    };
    const io = {
      call,
      go,
      links: true,
      reload: (msg) => draw(msg),
      back: (msg) => {
        path = history.pop() ?? "/";
        ctx.navigate?.(path);
        draw(msg);
      },
      toast: (text) => ctx.toast(text)
    };
    const offs = LIVE.map((ev) => ctx.on?.(ev, () => {
      if (!el.querySelector("dialog[open]") && !el.contains(doc.activeElement)) draw();
    }) ?? (() => {
    }));
    draw();
    return {
      unmount() {
        alive = false;
        unwire?.();
        for (const off of offs) off();
        el.innerHTML = "";
      },
      update(p) {
        if (p !== path) {
          path = p;
          draw();
        }
      }
    };
  }
};
export {
  index_default as default
};
