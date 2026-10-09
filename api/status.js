// GET ?a=<allocationId>&d=<destination>&k=<telegram|x>  Authorization: Bearer <Privy token>
// Tells the claim page whether this user has proven the recipient identity.
//  telegram: they confirmed in the bot (stored in Redis).
//  x: the X account Privy verified for this user hashes to the payout's recipient tag.
import { HttpError, route, verifyPrivy, kvGet, privyUser, readAllocation, tagOf, ID_RE, ADDR_RE } from './_shared.js';

export default route('GET', async (req) => {
  const did = await verifyPrivy(req);
  const { a, d, k } = req.query || {};
  if (!ID_RE.test(a || '') || !ADDR_RE.test(d || '')) throw new HttpError(400, 'Bad request.');

  if (k === 'x') {
    const [user, alloc] = await Promise.all([privyUser(did), readAllocation(a)]);
    const confirmed = !!user.xUsername && tagOf(user.xUsername, 'x') === alloc.tag && user.wallets.includes(d.toLowerCase());
    return { confirmed, linked: user.xUsername };
  }

  const conf = await kvGet(`conf:${a}`);
  return { confirmed: !!conf && conf.did === did && conf.destination === d.toLowerCase() };
});
