// POST { allocationId, destination }  Authorization: Bearer <Privy token>
// Returns a one-time code for the Telegram deep link. The code is bound to this Privy user and this wallet.
import { HttpError, route, verifyPrivy, readAllocation, kvSet, newCode, ID_RE, ADDR_RE, STATUS_OPEN } from './_shared.js';

export default route('POST', async (req) => {
  const did = await verifyPrivy(req);
  const { allocationId, destination } = req.body || {};
  if (!ID_RE.test(allocationId || '')) throw new HttpError(400, 'This claim link is not valid.');
  if (!ADDR_RE.test(destination || '')) throw new HttpError(400, 'Your wallet is not ready yet.');

  const a = await readAllocation(allocationId);
  if (a.status !== STATUS_OPEN) throw new HttpError(409, 'This payout can no longer be claimed.');

  const code = newCode();
  await kvSet(`code:${code}`, { allocationId, did, destination: destination.toLowerCase() }, 15 * 60);
  return { code };
});
