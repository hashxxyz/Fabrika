// Reads a wallet's native-MON history from the Etherscan V2 API (Monad Testnet), no matter which app sent it.
// Standalone on purpose (no imports) so it can be tested without the rest of the backend.
const BASE = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 10143;

// Turns Etherscan's normal + internal transaction lists into one list of money movements for `addr`.
// Internal rows matter: contract payouts (a Fabrika claim or refund) arrive as internal transfers, not normal ones.
export function normalize(addr, normal = [], internal = [], apps = {}) {
  const me = String(addr).toLowerCase();
  const rows = new Map();
  const add = (r, isInternal) => {
    const value = String(r?.value ?? '0');
    if (!/^\d+$/.test(value) || value === '0') return; // only real MON movements
    const from = String(r.from || '').toLowerCase();
    const to = String(r.to || '').toLowerCase();
    if (from !== me && to !== me) return;
    const dir = from === me && to === me ? 'self' : from === me ? 'out' : 'in';
    const cp = dir === 'out' ? to : from; // the other side ("" for contract creation)
    const hash = String(r.hash || '').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return;
    const id = `${hash}:${isInternal ? `i${r.traceId ?? ''}:${from}:${to}:${value}` : 'n'}`;
    rows.set(id, {
      id, hash, at: Number(r.timeStamp) || 0, dir, cp, value,
      failed: r.isError === '1' || r.isError === 1 || (r.txreceipt_status === '0'),
      app: apps[cp] || '', internal: isInternal,
    });
  };
  normal.forEach((r) => add(r, false));
  internal.forEach((r) => add(r, true));
  return [...rows.values()].sort((a, b) => b.at - a.at).slice(0, 100);
}

async function call(action, address, key) {
  const u = new URL(BASE);
  Object.entries({
    chainid: CHAIN_ID, module: 'account', action, address, startblock: 0, endblock: 9999999999,
    page: 1, offset: 50, sort: 'desc', apikey: key,
  }).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`explorer http ${res.status}`);
  const j = await res.json();
  if (Array.isArray(j.result)) return j.result;
  if (/no transactions found|no records found/i.test(String(j.message))) return [];
  throw new Error(String(j.result || j.message || 'bad explorer response'));
}

export async function fetchActivity(address, key, apps = {}) {
  const [normal, internal] = await Promise.all([call('txlist', address, key), call('txlistinternal', address, key)]);
  return normalize(address, normal, internal, apps);
}
