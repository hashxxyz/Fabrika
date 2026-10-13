// GET  Authorization: Bearer <Privy token>
// Lists payouts waiting for the X account this person has linked (the one Privy verified).
// The list of ids comes from Redis; every amount, status and expiry is read from the chain, never trusted from storage.
import { route, verifyPrivy, privyUser, kvList, kvGet, kvSet, readAllocation, tagOf, STATUS_OPEN } from './_shared.js';

export default route('GET', async (req) => {
  const did = await verifyPrivy(req);
  // Cache the linked X name for a few minutes so polling does not hit the Privy API each time.
  // Only a found name is cached, so linking an account shows up on the next poll.
  let xName = (await kvGet(`pend:x:${did}`).catch(() => null))?.x || '';
  if (!xName) {
    xName = (await privyUser(did)).xUsername;
    if (xName) await kvSet(`pend:x:${did}`, { x: xName }, 300).catch(() => {});
  }
  if (!xName) return { linked: false, items: [] };
  const user = { xUsername: xName };

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
