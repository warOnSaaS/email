// Sorting the inbox into "needs you", "FYI" and "newsletters".
// The team's own rules come first, then plain signals in the headers, then the model if one is set.
import { chat, modelConfigured, untrusted } from './model.mjs';

import { BUCKETS, BUCKET_LABEL } from './labels.mjs';
export { BUCKETS, BUCKET_LABEL };

const glob = (pat, s) => new RegExp(`^${String(pat).toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(String(s).toLowerCase());

export function ruleTriage(msg, { rules = [], me } = {}) {
  for (const r of rules) {
    if (r.from && !glob(r.from, msg.from.address)) continue;
    if (r.subject && !String(msg.subject).toLowerCase().includes(String(r.subject).toLowerCase())) continue;
    if (!r.from && !r.subject) continue;
    return { triage: r.triage, by: 'rule', reason: `Your rule: ${r.from ? `from ${r.from}` : ''}${r.from && r.subject ? ', ' : ''}${r.subject ? `subject has "${r.subject}"` : ''}` };
  }
  // A wOS alert that asks you something waits for your answer.
  if (msg.wos === 'alert-question') return { triage: 'needs_you', by: 'rules', reason: 'A wOS alert asking for your answer' };
  if (msg.listUnsubscribe || msg.precedence === 'bulk' || msg.precedence === 'list') return { triage: 'news', by: 'rules', reason: 'Sent to a mailing list' };
  if (msg.autoSubmitted && msg.autoSubmitted !== 'no') return { triage: 'fyi', by: 'rules', reason: 'Sent automatically' };
  if (/^(no-?reply|notifications?|alerts?|mailer-daemon|billing|receipts?)@/i.test(msg.from.address)) return { triage: 'fyi', by: 'rules', reason: 'From an automated address' };
  const direct = me && msg.to.some((a) => a.address === me);
  const asks = /\?|\b(can you|could you|please|let me know|need|asap|by (mon|tue|wed|thu|fri|tomorrow|today|eod))\b/i.test(`${msg.subject}\n${msg.text.slice(0, 2000)}`);
  if (direct && asks) return { triage: 'needs_you', by: 'rules', reason: 'Addressed to you, with a question or a request' };
  if (!direct) return { triage: 'fyi', by: 'rules', reason: 'You are copied, not addressed' };
  return { triage: 'needs_you', by: 'rules', reason: 'Addressed to you' };
}

export async function triage(msg, opts = {}) {
  const base = ruleTriage(msg, opts);
  if (base.by === 'rule' || base.triage === 'news' || !modelConfigured(opts.env)) return base;
  try {
    const out = await chat({
      env: opts.env,
      json: true,
      system: 'You sort one email for a busy person. Answer JSON {"triage": "needs_you" | "fyi" | "news", "reason": "under 12 words"}. needs_you: a person expects a reply or action from them. fyi: worth knowing, no action. news: newsletters, marketing, digests.',
      user: `The person is ${opts.me}.\n${untrusted(msg, { max: 3000 })}`,
    });
    if (out && BUCKETS.includes(out.triage)) return { triage: out.triage, by: 'model', reason: String(out.reason ?? '').slice(0, 120) };
  } catch {}
  return base;
}
