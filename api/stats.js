// GET  (public, no sign in)  Live totals for the whole product.
// Money that went through Fabrika contracts is read from their blockchain events (Etherscan V2 logs, needs ETHERSCAN_API_KEY).
// Direct wallet sends are counted by /api/history when the app reports them (Redis counters).
// Only totals leave this endpoint: no wallet addresses, no names.
import { formatEther, parseAbi, decodeEventLog } from 'viem';
import { HttpError, route, env, kvGet, kvSet, kvCmd } from './_shared.js';

const BASE = 'https://api.etherscan.io/v2/api';
const CHAIN_ID = 10143;
const PAGE = 1000; // Etherscan maximum per page
const MAX_PAGES = 10; // Etherscan only serves the first 10,000 rows of a query
const CACHE_SECONDS = 60;

const ABI = {
  vault: parseAbi([
    'event BatchCreated(bytes32 indexed batchId, address indexed sender, uint256 total, uint256 count, uint64 expiresAt)',
    'event Claimed(bytes32 indexed allocationId, address indexed destination, uint256 amount)',
    'event Cancelled(bytes32 indexed allocationId, address indexed sender, uint256 amount)',
    'event Refunded(bytes32 indexed allocationId, address indexed sender, uint256 amount)',
  ]),
  pay: parseAbi(['event Paid(bytes32 indexed id, address indexed payer, address indexed recipient, uint256 amount)']),
  split: parseAbi(['event SharePaid(bytes32 indexed id, uint256 indexed slot, address indexed payer, uint256 amount)']),
  savings: parseAbi([
    'event Opened(bytes32 indexed id, address indexed owner, uint256 principal, uint64 goalBy)',
    'event Closed(bytes32 indexed id, uint256 principal, uint256 yield_)',
  ]),
};

// An error from the explorer itself. Its message holds no secrets, so it is safe to show.
class ExplorerError extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(address, key, page) {
  const u = new URL(BASE);
  Object.entries({ chainid: CHAIN_ID, module: 'logs', action: 'getLogs', address, fromBlock: 0, toBlock: 'latest', page, offset: PAGE, apikey: key })
    .forEach(([k, v]) => u.searchParams.set(k, String(v)));
  // The free plan allows about 3 calls a second. If the explorer says it is busy, wait and ask again.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(u);
    if (!res.ok) throw new ExplorerError(`explorer answered ${res.status}`);
    const j = await res.json();
    if (Array.isArray(j.result)) return j.result;
    if (/no records found/i.test(String(j.message))) return [];
    const why = String(j.result || j.message || 'bad explorer response').slice(0, 140);
    if (/rate limit/i.test(why) && attempt < 2) { await sleep(1200); continue; }
    throw new ExplorerError(why);
  }
}

async function getLogs(address, key) {
  const rows = [];
  let partial = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const part = await fetchPage(address, key, page);
    rows.push(...part);
    if (part.length < PAGE) break;
    if (page === MAX_PAGES) partial = true;
    await sleep(400);
  }
  return { rows, partial };
}

function decode(abi, row) {
  try {
    const topics = (row.topics || []).filter(Boolean);
    return decodeEventLog({ abi, data: row.data, topics });
  } catch { return null; }
}

export default route('GET', async () => {
  const cached = await kvGet('stats:cache').catch(() => null);
  if (cached) return cached;

  const key = env('ETHERSCAN_API_KEY');
  if (!key) throw new HttpError(503, 'Stats are not set up yet.');

  const addr = {
    vault: env('VAULT_ADDRESS', 'VITE_VAULT_ADDRESS'),
    pay: env('PAY_ADDRESS', 'VITE_PAY_ADDRESS'),
    split: env('SPLIT_ADDRESS', 'VITE_SPLIT_ADDRESS'),
    savings: env('SAVINGS_ADDRESS', 'VITE_SAVINGS_ADDRESS'),
  };

  const wallets = new Set();
  const w = (a) => { if (a) wallets.add(String(a).toLowerCase()); };
  const p = {
    usernames: { in: 0n, count: 0 }, invoices: { in: 0n, count: 0 }, splits: { in: 0n, count: 0 },
    savings: { in: 0n, out: 0n, count: 0 }, direct: { in: 0n, count: 0 },
  };
  let paidOut = 0n; // claimed by recipients, returned to senders, or withdrawn from savings
  let partial = false;

  try {
    for (const name of Object.keys(addr)) {
      if (!addr[name]) continue;
      await sleep(350); // stay under the free plan's calls per second
      let got;
      try { got = await getLogs(addr[name], key); } catch (e) { e.contract = name; throw e; }
      const { rows, partial: cut } = got;
      if (cut) partial = true;
      for (const row of rows) {
        const e = decode(ABI[name], row);
        if (!e) continue;
        const a = e.args;
        if (e.eventName === 'BatchCreated') { p.usernames.in += a.total; p.usernames.count += Number(a.count); w(a.sender); }
        else if (e.eventName === 'Claimed') { paidOut += a.amount; w(a.destination); }
        else if (e.eventName === 'Cancelled' || e.eventName === 'Refunded') { paidOut += a.amount; }
        else if (e.eventName === 'Paid') { p.invoices.in += a.amount; p.invoices.count += 1; w(a.payer); w(a.recipient); }
        else if (e.eventName === 'SharePaid') { p.splits.in += a.amount; p.splits.count += 1; w(a.payer); }
        else if (e.eventName === 'Opened') { p.savings.in += a.principal; p.savings.count += 1; w(a.owner); }
        else if (e.eventName === 'Closed') { const back = a.principal + a.yield_; p.savings.out += back; paidOut += back; }
      }
    }
  } catch (e) {
    console.error('stats failed', e?.contract || '', e?.message || e);
    // Explorer errors carry no secrets, so show them. That lets you see what to fix without opening the server logs.
    const where = e?.contract ? ` (${e.contract}` : '';
    const detail = e instanceof ExplorerError ? `${where ? where + ': ' : ' ('}${e.message})` : `${where ? where + ': ' : ' ('}${e?.name || 'error'})`;
    throw new HttpError(503, `Could not read the blockchain right now${detail}.`);
  }

  // Direct wallet sends, counted by the app (micro-MON back to wei).
  try {
    const [micro, count, members] = await Promise.all([kvCmd('GET', 'stats:direct:micro'), kvCmd('GET', 'stats:direct:count'), kvCmd('SMEMBERS', 'stats:wallets')]);
    p.direct.in = BigInt(micro || 0) * 10n ** 12n;
    p.direct.count = Number(count || 0);
    (Array.isArray(members) ? members : []).forEach(w);
  } catch (e) { console.error('direct stats failed', e?.message || e); }

  const volume = p.usernames.in + p.invoices.in + p.splits.in + p.savings.in + p.direct.in;
  const payments = p.usernames.count + p.invoices.count + p.splits.count + p.direct.count;
  const wei = (v) => v.toString();
  const out = {
    updatedAt: Date.now(), partial, volume: wei(volume), paidOut: wei(paidOut), payments, people: wallets.size,
    products: {
      usernames: { in: wei(p.usernames.in), count: p.usernames.count },
      invoices: { in: wei(p.invoices.in), count: p.invoices.count },
      splits: { in: wei(p.splits.in), count: p.splits.count },
      savings: { in: wei(p.savings.in), out: wei(p.savings.out), count: p.savings.count },
      direct: { in: wei(p.direct.in), count: p.direct.count },
    },
    contracts: Object.fromEntries(Object.entries(addr).filter(([, v]) => v)),
  };
  await kvSet('stats:cache', out, CACHE_SECONDS).catch(() => {});
  return out;
});
