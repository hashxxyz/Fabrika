// Names people give to addresses and transactions, so they follow the person across devices.
//  GET  ?address=0x...                       -> { labels: { "addr:0x...": "Mum", "tx:0x...": "Rent" } }
//  POST { address, key, name }               key is "addr:0x<40 hex>" or "tx:0x<64 hex>". Empty name removes it.
// Both need the Privy token, and the wallet must belong to the signed-in user.
import { HttpError, route, verifyPrivy, privyUser, kvHset, kvHdel, kvHall, kvHlen, kvHexists, ADDR_RE } from './_shared.js';

const KEY_RE = /^(addr:0x[0-9a-f]{40}|tx:0x[0-9a-f]{64})$/;
const MAX_LABELS = 500;

async function owned(req, address) {
  const did = await verifyPrivy(req);
  const a = String(address || '').toLowerCase();
  if (!ADDR_RE.test(a)) throw new HttpError(400, 'Bad request.');
  const user = await privyUser(did);
  if (!user.wallets.includes(a)) throw new HttpError(403, 'That wallet is not on your account.');
  return a;
}

const get = route('GET', async (req) => {
  const a = await owned(req, (req.query || {}).address);
  return { labels: await kvHall(`lbl:${a}`) };
});

const post = route('POST', async (req) => {
  const b = req.body || {};
  const a = await owned(req, b.address);
  const key = String(b.key || '').toLowerCase();
  if (!KEY_RE.test(key)) throw new HttpError(400, 'Bad request.');
  const name = String(b.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  const k = `lbl:${a}`;
  if (!name) { await kvHdel(k, key); return { ok: true }; }
  if (!(await kvHexists(k, key)) && (await kvHlen(k)) >= MAX_LABELS) throw new HttpError(400, 'Too many saved names. Remove some first.');
  await kvHset(k, key, name);
  return { ok: true };
});

export default (req, res) => (req.method === 'POST' ? post(req, res) : get(req, res));
