// POST { address }  Authorization: Bearer <Privy token>
// Sends a small starter balance of test MON, once per person, so a new user can pay or send without visiting a faucet.
// Guards: the address must belong to the signed-in Privy user, one grant per user and per address,
// a daily cap, and the relayer must keep a reserve for claim gas.
import { parseEther, formatEther } from 'viem';
import {
  HttpError, route, verifyPrivy, privyUser, kvLock, kvDel, kvCount, publicClient, relayerClient, relayerAccount, ADDR_RE,
} from './_shared.js';

const YEAR = 365 * 24 * 3600;
const amountWei = () => { try { return parseEther(String(process.env.WELCOME_AMOUNT || '0.1').trim()); } catch { return parseEther('0.1'); } };
const dailyCap = () => (Number(process.env.WELCOME_DAILY_CAP) > 0 ? Number(process.env.WELCOME_DAILY_CAP) : 50);

export default route('POST', async (req) => {
  const did = await verifyPrivy(req);
  const { address } = req.body || {};
  if (!ADDR_RE.test(address || '')) throw new HttpError(400, 'Your account is not ready yet.');
  const addr = address.toLowerCase();

  const user = await privyUser(did);
  if (!user.wallets.includes(addr)) throw new HttpError(403, 'That wallet is not on your account.');

  const amount = amountWei();
  if ((await publicClient.getBalance({ address })) >= amount) throw new HttpError(409, 'You already have a balance.');

  const kAddr = `welcome:addr:${addr}`;
  const kDid = `welcome:did:${did}`;
  if (!(await kvLock(kAddr, YEAR))) throw new HttpError(409, 'Starter balance already sent.');
  if (!(await kvLock(kDid, YEAR))) { await kvDel(kAddr).catch(() => {}); throw new HttpError(409, 'Starter balance already sent.'); }
  const release = () => Promise.all([kvDel(kAddr), kvDel(kDid)]).catch(() => {});

  try {
    const day = new Date().toISOString().slice(0, 10);
    if ((await kvCount(`welcome:day:${day}`, 2 * 24 * 3600)) > dailyCap()) {
      throw new HttpError(503, 'Starter balances are used up for today.');
    }
    const relayer = relayerAccount();
    const bal = await publicClient.getBalance({ address: relayer.address });
    if (bal < amount + 10n ** 16n * 2n) {
      console.error(`Relayer ${relayer.address} is low for starter balances: ${formatEther(bal)} MON`);
      throw new HttpError(503, 'Starter balances are paused. Try again later.');
    }
    const hash = await relayerClient().sendTransaction({ to: address, value: amount });
    try { await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 }); } catch { /* sent; the balance will show shortly */ }
    return { granted: true, amount: formatEther(amount) };
  } catch (e) {
    await release();
    throw e;
  }
});
