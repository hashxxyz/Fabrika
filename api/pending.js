// GET  Authorization: Bearer <Privy token>
// Lists payouts waiting for the X account this person has linked (the one Privy verified).
// The list of ids comes from Redis; every amount, status and expiry is read from the chain, never trusted from storage.
import { route, verifyPrivy, privyUser, kvList, readAllocation, tagOf, STATUS_OPEN } from './_shared.js';

export default route('GET', async (req) => {
  const did = await verifyPrivy(req);
  const user = await privyUser(did);
  if (!user.xUsername) return { linked: false, items: [] };

  const tag = tagOf(user.xUsername, 'x');
  const seen = new Set();
  const ids = (await kvList(`pend:${tag}`)).map((r) => r?.id).filter((id) => typeof id === 'string' && !seen.has(id) && seen.add(id)).slice(0, 50);
  const now = Math.floor(Date.now() / 1000);

  const rows = await Promise.all(ids.map(async (id) => {
    try {
      const a = await readAllocation(id);
      if (a.status !== STATUS_OPEN || a.tag !== tag || Number(a.expiresAt) <= now) return null;
      return { id, amount: a.amount.toString(), expiresAt: Number(a.expiresAt), sender: a.sender.toLowerCase() };
    } catch { return null; }
  }));
  return { linked: true, x: user.xUsername, items: rows.filter(Boolean) };
});
