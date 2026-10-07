import crypto from 'node:crypto';
import { seedDemo, DEMO } from '../lib/demo.mjs';

export { DEMO };
export const web = (name = 'Sam Rivera') => ({ kind: 'person', channel: 'web', name });
export const agent = { kind: 'agent', channel: 'mcp', name: 'Agent (Sam)' };
export const sam = { email: DEMO.me };

export async function demo() {
  return seedDemo({ env: { WOS_DEMO: '1', PUBLIC_URL: 'https://mail.test' } });
}

// A small fake DNS for SPF, DKIM and DMARC, so signature checks run for real without the network.
export function fakeDns(domain, { selector = 'test', ipRanges = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const txt = {
    [domain]: [`v=spf1 ${ipRanges.map((r) => `ip4:${r}`).join(' ')} -all`],
    [`${selector}._domainkey.${domain}`]: [`v=DKIM1; k=rsa; p=${pub}`],
    [`_dmarc.${domain}`]: ['v=DMARC1; p=reject'],
  };
  const resolver = async (name, type) => {
    const n = name.toLowerCase().replace(/\.$/, '');
    if (type === 'TXT' && txt[n]) return txt[n].map((t) => [t]);
    const e = new Error(`queryTxt ENOTFOUND ${name}`);
    e.code = 'ENOTFOUND';
    throw e;
  };
  return { resolver, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), selector, domain };
}
