// GET ?address=0x...  Authorization: Bearer <Privy token>
// Every MON movement in or out of this wallet, including ones made from other apps (Trust Wallet, MetaMask, ...).
// The wallet must belong to the signed-in user. Needs ETHERSCAN_API_KEY (free key, Monad Testnet is on the free tier).
import { HttpError, route, verifyPrivy, privyUser, kvGet, kvSet, env, ADDR_RE } from './_shared.js';
import { fetchActivity } from './_activity.js';

export default route('GET', async (req) => {
  const did = await verifyPrivy(req);
  const address = String((req.query || {}).address || '').toLowerCase();
  if (!ADDR_RE.test(address)) throw new HttpError(400, 'Bad request.');
  const user = await privyUser(did);
  if (!user.wallets.includes(address)) throw new HttpError(403, 'That wallet is not on your account.');

  const key = env('ETHERSCAN_API_KEY');
  if (!key) throw new HttpError(503, 'Wallet activity is not set up yet.');

  // Short cache so refreshing the page does not burn the shared free quota.
  const cached = await kvGet(`act:${address}`).catch(() => null);
  if (cached) return cached;

  const apps = {};
  const vault = env('VAULT_ADDRESS', 'VITE_VAULT_ADDRESS');
  const pay = env('PAY_ADDRESS', 'VITE_PAY_ADDRESS');
  if (vault) apps[vault.toLowerCase()] = 'Fabrika vault';
  if (pay) apps[pay.toLowerCase()] = 'Fabrika invoice';

  let items;
  try { items = await fetchActivity(address, key, apps); } catch (e) {
    console.error('activity lookup failed', e?.message || e);
    throw new HttpError(503, 'Could not load wallet activity. Try again in a moment.');
  }
  const out = { items };
  await kvSet(`act:${address}`, out, 20).catch(() => {});
  return out;
});
