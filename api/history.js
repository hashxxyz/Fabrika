// Account history that follows the person across devices.
//  POST { type: 'payment' | 'invoice' | 'transfer', ... }  records one item after it happened on chain.
//  GET  ?address=0x...                                     returns everything recorded for that wallet.
// Both need the Privy token, and the wallet must belong to the signed-in user. Nothing here is trusted blindly:
// every item is checked against the chain before it is stored (the sender, the recipient tag, the invoice owner).
import {
  HttpError, route, verifyPrivy, privyUser, kvPush, kvList, kvLock, kvDel, kvSet, readAllocation, readRequest, publicClient,
  tagOf, maskEmail, ID_RE, ADDR_RE, kvCmd, env,
} from './_shared.js';

const YEAR = 365 * 24 * 3600;
const HANDLE_RE = /^[a-z0-9_]{1,32}$/;
// Run fn once per key. If it fails, free the key so a retry can store the item.
async function once(key, fn) {
  if (!(await kvLock(key.toLowerCase(), YEAR))) return;
  try { await fn(); } catch (e) { await kvDel(key.toLowerCase()).catch(() => {}); throw e; }
}
// Direct wallet sends never touch a Fabrika contract, so they are counted here, once per verified transaction.
// Amounts are stored in micro-MON (wei / 1e12) so the total fits a Redis integer. One script keeps the three counters in step.
const COUNT = "redis.call('INCRBY',KEYS[1],ARGV[1]) redis.call('INCR',KEYS[2]) redis.call('SADD',KEYS[3],ARGV[2]) return 1";
const recordDirect = (from, wei) => kvCmd('EVAL', COUNT, '3', 'stats:direct:micro', 'stats:direct:count', 'stats:wallets', String(wei / 10n ** 12n), String(from).toLowerCase());
const fabrikaContracts = () => new Set(['VAULT_ADDRESS', 'PAY_ADDRESS', 'SPLIT_ADDRESS', 'SAVINGS_ADDRESS'].map((k) => env(k, `VITE_${k}`).toLowerCase()).filter(Boolean));
const cleanNote = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const get = route('GET', async (req) => {
  const did = await verifyPrivy(req);
  const address = String((req.query || {}).address || '').toLowerCase();
  if (!ADDR_RE.test(address)) throw new HttpError(400, 'Bad request.');
  const user = await privyUser(did);
  if (!user.wallets.includes(address)) throw new HttpError(403, 'That wallet is not on your account.');
  const [payments, invoices, transfers] = await Promise.all([
    kvList(`hist:pay:${address}`), kvList(`hist:inv:${address}`), kvList(`hist:tr:${address}`),
  ]);
  return { payments, invoices, transfers };
});

const post = route('POST', async (req) => {
  const did = await verifyPrivy(req);
  const b = req.body || {};
  const user = await privyUser(did);
  const mine = (a) => user.wallets.includes(String(a).toLowerCase());

  if (b.type === 'payment') {
    const items = Array.isArray(b.items) ? b.items.slice(0, 100) : [];
    const kind = b.kind === 'x' ? 'x' : 'telegram';
    if (!ID_RE.test(b.batchId || '') || !items.length) throw new HttpError(400, 'Bad request.');
    const checked = await Promise.all(items.map(async (it) => {
      if (!ID_RE.test(it?.id || '') || !HANDLE_RE.test(String(it?.handle || ''))) throw new HttpError(400, 'Bad request.');
      const a = await readAllocation(it.id);
      if (a.status === 0 || a.batchId.toLowerCase() !== b.batchId.toLowerCase() || !mine(a.sender) || a.tag !== tagOf(it.handle, kind)) throw new HttpError(403, 'That payment is not yours.');
      return { id: it.id, handle: String(it.handle), amount: a.amount.toString(), sender: a.sender.toLowerCase(), note: cleanNote(it.note) };
    }));
    const sender = checked[0].sender;
    const hash = ID_RE.test(String(b.hash || '')) ? String(b.hash).toLowerCase() : '';
    await once(`hist:seen:${b.batchId}`, async () => {
      // X payments are also indexed by the recipient's tag, so /api/pending can find them when that X account signs in.
      // Only the allocation id is stored; amount, status and expiry are always read from the chain.
      if (kind === 'x') await Promise.all(checked.map((c, i) => kvPush(`pend:${tagOf(items[i].handle, 'x')}`, { id: c.id, at: Date.now() }, 100)));
      await kvPush(`hist:pay:${sender}`, {
        batchId: b.batchId.toLowerCase(), hash, kind, createdAt: Number(b.createdAt) || Date.now(), expiresAt: Number(b.expiresAt) || 0,
        items: checked.map(({ id, handle, amount, note }) => ({ id, kind, handle, amount, ...(note ? { note } : {}) })),
      });
    });
    return { ok: true };
  }

  if (b.type === 'invoice') {
    if (!ID_RE.test(b.id || '')) throw new HttpError(400, 'Bad request.');
    const r = await readRequest(b.id);
    if (r.status === 0 || !mine(r.recipient)) throw new HttpError(403, 'That invoice is not yours.');
    // Verified identity shown to the payer: an X account Privy checked, or a masked email.
    await kvSet(`who:${r.recipient}`, { x: user.xUsername || '', email: maskEmail(user.email) }, YEAR);
    await once(`hist:seen:${b.id}`, () => kvPush(`hist:inv:${r.recipient}`, { id: b.id.toLowerCase(), at: Date.now() }));
    return { ok: true };
  }

  if (b.type === 'transfer') {
    if (!ID_RE.test(b.hash || '')) throw new HttpError(400, 'Bad request.');
    const tx = await publicClient.getTransaction({ hash: b.hash }).catch(() => null);
    if (!tx || !tx.to || !mine(tx.from)) throw new HttpError(403, 'That transfer is not yours.');
    const rc = await publicClient.getTransactionReceipt({ hash: b.hash }).catch(() => null);
    if (!rc || rc.status !== 'success') throw new HttpError(409, 'That transfer is not confirmed.');
    // Sends into a Fabrika contract are already counted from its events, so only plain wallet sends are added here.
    if (!fabrikaContracts().has(tx.to.toLowerCase())) await once(`stat:seen:${b.hash}`, () => recordDirect(tx.from, tx.value));
    await once(`hist:seen:${b.hash}`, () => kvPush(`hist:tr:${tx.from.toLowerCase()}`, { hash: b.hash.toLowerCase(), to: tx.to, amount: tx.value.toString(), at: Date.now(), ...(cleanNote(b.note) ? { note: cleanNote(b.note) } : {}) }));
    return { ok: true };
  }

  throw new HttpError(400, 'Bad request.');
});

export default (req, res) => (req.method === 'POST' ? post(req, res) : get(req, res));
