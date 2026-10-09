// GET ?a=<wallet>  Public. Returns the verified identity a person attached to their invoices, so the payer can see
// who is asking: an X username Privy verified through OAuth, or a masked email. Empty if there is none.
import { route, kvGet, ADDR_RE } from './_shared.js';

export default route('GET', async (req) => {
  const a = String((req.query || {}).a || '').toLowerCase();
  if (!ADDR_RE.test(a)) return {};
  const w = await kvGet(`who:${a}`).catch(() => null);
  return w ? { x: w.x || '', email: w.email || '' } : {};
});
