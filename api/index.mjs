// The one Vercel function. Every route goes through lib/http.mjs, as on the Node server. The hosted demo
// runs on the in-memory mail server (WOS_DEMO=1): nothing connects to a real mailbox.
import { makeHandler } from '../lib/http.mjs';
import { createEmailApp } from '../lib/app.mjs';
import { seedDemo } from '../lib/demo.mjs';

const demo = !!process.env.WOS_DEMO;
let ready;
const getApp = () => (ready ??= demo ? seedDemo().then((x) => x.app) : createEmailApp());
const handle = makeHandler(getApp, { demo });

export default function handler(req, res) {
  return handle(req, res);
}
