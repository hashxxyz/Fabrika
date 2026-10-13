// Shared helpers for the Fabrika serverless functions. Files starting with "_" are not routes on Vercel.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createPublicClient, createWalletClient, http, parseAbi, defineChain, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const env = (k, ...alts) => {
  for (const name of [k, ...alts]) { const v = (process.env[name] || '').trim(); if (v) return v; }
  return '';
};
const need = (k, ...alts) => {
  const v = env(k, ...alts);
  if (!v) { console.error(`Missing env var ${k}`); throw new HttpError(503, 'The claim service is not configured yet.'); }
  return v;
};

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [env('RPC_URL') || 'https://testnet-rpc.monad.xyz'] } },
});

export const vaultAbi = parseAbi([
  'function claim(bytes32 allocationId, address destination, uint256 deadline, bytes signature)',
  'function getAllocation(bytes32 allocationId) view returns (address sender, bytes32 batchId, bytes32 recipientTag, uint256 amount, uint64 expiresAt, uint8 status)',
]);
export const STATUS_OPEN = 1;

export const vaultAddress = () => need('VAULT_ADDRESS', 'VITE_VAULT_ADDRESS');
export const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

const key = (name) => {
  const k = need(name);
  return privateKeyToAccount(k.startsWith('0x') ? k : `0x${k}`);
};
export const authorizerAccount = () => key('AUTHORIZER_PRIVATE_KEY');
// The key that signs claims must not also pay gas. If the gas wallet leaks, the attacker should not be able to release vault money.
// Set ALLOW_SHARED_RELAYER=1 only on a throwaway testnet setup.
export const relayerAccount = () => {
  if (env('RELAYER_PRIVATE_KEY')) return key('RELAYER_PRIVATE_KEY');
  if (env('ALLOW_SHARED_RELAYER') === '1') return authorizerAccount();
  console.error('Missing env var RELAYER_PRIVATE_KEY. Use a separate wallet for gas, not the authorizer key.');
  throw new HttpError(503, 'The claim service is not configured yet.');
};
export const relayerClient = () => createWalletClient({ account: relayerAccount(), chain: monadTestnet, transport: http() });

// Same rule as src/lib.js: trim, drop leading @, lowercase, keccak256 of the UTF-8 bytes.
export const normalizeHandle = (s) => String(s || '').trim().replace(/^@+/, '').toLowerCase();
// Telegram tags are the plain hash. X tags are namespaced with "x:" (same rule as src/lib.js).
export const tagOf = (handle, kind = 'telegram') => {
  const h = normalizeHandle(handle);
  return keccak256(toBytes(kind === 'x' ? `x:${h}` : h));
};

export const ID_RE = /^0x[0-9a-fA-F]{64}$/;
export const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
export const newCode = () => randomBytes(16).toString('hex'); // 32 chars, fits Telegram's start payload

export async function readAllocation(id) {
  const r = await publicClient.readContract({ address: vaultAddress(), abi: vaultAbi, functionName: 'getAllocation', args: [id] });
  return { sender: r[0], batchId: r[1], tag: r[2], amount: r[3], expiresAt: r[4], status: Number(r[5]) };
}

// ---- FabrikaPay (invoices): read-only, used to check who owns an invoice
const payAbi = parseAbi(['function getRequest(bytes32 id) view returns (address recipient, uint256 amount, uint64 expiresAt, uint8 status, address payer, uint64 paidAt, uint64 paidBlock)']);
export async function readRequest(id) {
  const r = await publicClient.readContract({ address: need('PAY_ADDRESS', 'VITE_PAY_ADDRESS'), abi: payAbi, functionName: 'getRequest', args: [id] });
  return { recipient: String(r[0]).toLowerCase(), status: Number(r[3]) };
}
export const maskEmail = (e) => { const [l, d] = String(e || '').split('@'); return l && d ? `${l[0]}***@${d}` : ''; };

// ---- Privy access token -> Privy user id (the "sub" claim)
let jwks;
export async function verifyPrivy(req) {
  const appId = need('PRIVY_APP_ID', 'VITE_PRIVY_APP_ID');
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Sign in first.');
  jwks ||= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: 'privy.io', audience: appId, algorithms: ['ES256'] });
    if (!payload.sub) throw new Error('no sub');
    return payload.sub;
  } catch {
    throw new HttpError(401, 'Your sign in expired. Sign in again.');
  }
}

// ---- Privy user record (server API). Used to read the X account Privy verified through OAuth,
// and the wallets that belong to this user. Needs PRIVY_APP_SECRET.
export async function privyUser(did) {
  const appId = need('PRIVY_APP_ID', 'VITE_PRIVY_APP_ID');
  const secret = need('PRIVY_APP_SECRET');
  const res = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(did)}`, {
    headers: { 'privy-app-id': appId, authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString('base64')}` },
  });
  if (!res.ok) { console.error('Privy user lookup failed', res.status); throw new HttpError(503, 'Could not check your account. Try again.'); }
  const u = await res.json();
  const accounts = Array.isArray(u.linked_accounts) ? u.linked_accounts : [];
  const x = accounts.find((a) => a.type === 'twitter_oauth');
  const wallets = accounts.filter((a) => a.type === 'wallet' && a.address).map((a) => String(a.address).toLowerCase());
  const em = accounts.find((a) => a.type === 'email');
  const gg = accounts.find((a) => a.type === 'google_oauth');
  const email = String(em?.address || gg?.email || '').toLowerCase();
  return { xUsername: x?.username ? normalizeHandle(x.username) : '', wallets, email };
}

// ---- Upstash Redis over REST (works from serverless, no extra package)
async function redis(...cmd) {
  const url = need('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL');
  const token = need('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN');
  const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) { console.error('Redis error', j.error || res.status); throw new HttpError(503, 'The claim service is busy. Try again.'); }
  return j.result;
}
export const kvCmd = redis; // raw command, used by the stats counters
export const kvSet = (k, v, ttl) => redis('SET', k, JSON.stringify(v), 'EX', String(ttl));
export const kvGet = async (k) => { const r = await redis('GET', k); return r ? JSON.parse(r) : null; };
export const kvDel = (k) => redis('DEL', k);
export const kvCount = async (k, ttl) => { const n = Number(await redis('INCR', k)); if (n === 1) await redis('EXPIRE', k, String(ttl)); return n; };
export const kvPush = async (k, v, max = 200) => { await redis('LPUSH', k, JSON.stringify(v)); await redis('LTRIM', k, '0', String(max - 1)); };
export const kvList = async (k) => ((await redis('LRANGE', k, '0', '199')) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
export const kvHset = (k, f, v) => redis('HSET', k, f, v);
export const kvHdel = (k, f) => redis('HDEL', k, f);
export const kvHlen = async (k) => Number(await redis('HLEN', k)) || 0;
export const kvHexists = async (k, f) => Number(await redis('HEXISTS', k, f)) === 1;
export const kvHall = async (k) => {
  const r = await redis('HGETALL', k);
  const o = {};
  if (Array.isArray(r)) for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1];
  else if (r && typeof r === 'object') Object.assign(o, r);
  return o;
};
export const kvDecr = (k) => redis('DECR', k);
export const kvLock = async (k, ttl) => (await redis('SET', k, '1', 'NX', 'EX', String(ttl))) === 'OK';

// One relayer key sends from many serverless instances. Serialize the send step so two requests never share a nonce.
// The lock holds a random token and is only deleted by its owner, so a slow request that lost its lock
// can never free the lock of the request that came after it.
const UNLOCK = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
export async function withRelayerLock(fn) {
  const k = 'lock:relayer';
  const token = randomBytes(12).toString('hex');
  let got = false;
  for (let i = 0; i < 20 && !got; i++) {
    got = (await redis('SET', k, token, 'NX', 'EX', '30')) === 'OK';
    if (!got) await new Promise((r) => setTimeout(r, 400));
  }
  if (!got) throw new HttpError(503, 'The claim service is busy. Try again.');
  try { return await fn(); } finally { await redis('EVAL', UNLOCK, '1', k, token).catch(() => {}); }
}

// ---- Telegram
export async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${need('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) console.error('Telegram error', method, res.status, await res.text().catch(() => ''));
}
export const webhookSecret = () => need('TELEGRAM_WEBHOOK_SECRET');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- Route wrapper: method check, JSON in and out, errors never leak internals
export function route(method, fn) {
  return async (req, res) => {
    try {
      if (req.method !== method) throw new HttpError(405, 'Method not allowed');
      const out = await fn(req);
      res.status(200).json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ message: e.message });
      console.error(e);
      res.status(500).json({ message: 'Something went wrong. Try again.' });
    }
  };
}
