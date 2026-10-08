// The one Vercel function. Every route goes through lib/http.mjs, as on the Node server. The hosted copy
// runs on the in-memory mail server (WOS_DEMO=1): nothing connects to a real mailbox. People sign in with
// their warOnSaaS account (AUTH_PROVIDER=waronsaas) and each gets a space of their own (lib/hosted.mjs).
import { makeHandler } from '../lib/http.mjs';
import { makeGetApp } from '../lib/hosted.mjs';

const demo = !!process.env.WOS_DEMO;
const handle = makeHandler(makeGetApp({ env: process.env, demo }), { demo });

export default function handler(req, res) {
  return handle(req, res);
}
