// GET ?a=<allocationId>&d=<destination>  Authorization: Bearer <Privy token>
// Tells the claim page whether this user already confirmed on Telegram.
import { HttpError, route, verifyPrivy, kvGet, ID_RE, ADDR_RE } from './_shared.js';

export default route('GET', async (req) => {
  const did = await verifyPrivy(req);
  const { a, d } = req.query || {};
  if (!ID_RE.test(a || '') || !ADDR_RE.test(d || '')) throw new HttpError(400, 'Bad request.');
  const conf = await kvGet(`conf:${a}`);
  return { confirmed: !!conf && conf.did === did && conf.destination === d.toLowerCase() };
});
