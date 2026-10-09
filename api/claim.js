// POST { allocationId, destination }  Authorization: Bearer <Privy token>
// Verifies the Privy user and the Telegram confirmation, signs the EIP-712 claim, and relays it (relayer pays gas).
import { formatEther } from 'viem';
import {
  HttpError, route, verifyPrivy, kvGet, kvDel, kvLock, readAllocation, publicClient, relayerClient, relayerAccount,
  authorizerAccount, vaultAddress, vaultAbi, monadTestnet, ID_RE, ADDR_RE, STATUS_OPEN,
} from './_shared.js';

export default route('POST', async (req) => {
  const did = await verifyPrivy(req);
  const { allocationId, destination } = req.body || {};
  if (!ID_RE.test(allocationId || '')) throw new HttpError(400, 'This claim link is not valid.');
  if (!ADDR_RE.test(destination || '')) throw new HttpError(400, 'Your wallet is not ready yet.');

  const conf = await kvGet(`conf:${allocationId}`);
  if (!conf || conf.did !== did) throw new HttpError(403, 'Confirm your Telegram username first.');
  if (conf.destination !== destination.toLowerCase()) throw new HttpError(403, 'Your wallet changed. Confirm on Telegram again.');

  // One claim at a time per allocation.
  if (!(await kvLock(`lock:${allocationId}`, 60))) throw new HttpError(409, 'A claim is already in progress.');
  try {
    const a = await readAllocation(allocationId);
    if (a.status !== STATUS_OPEN) throw new HttpError(409, 'This payout can no longer be claimed.');

    const vault = vaultAddress();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const signature = await authorizerAccount().signTypedData({
      domain: { name: 'Fabrika', version: '1', chainId: monadTestnet.id, verifyingContract: vault },
      types: {
        Claim: [
          { name: 'allocationId', type: 'bytes32' },
          { name: 'recipientTag', type: 'bytes32' },
          { name: 'destination', type: 'address' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Claim',
      message: { allocationId, recipientTag: a.tag, destination, deadline },
    });

    const relayer = relayerAccount();
    const bal = await publicClient.getBalance({ address: relayer.address });
    if (bal < 10n ** 16n) { console.error(`Relayer ${relayer.address} is low: ${formatEther(bal)} MON`); throw new HttpError(503, 'The claim service is out of gas. Try again later.'); }

    // Simulate first so a doomed claim never costs gas.
    let request;
    try {
      ({ request } = await publicClient.simulateContract({
        address: vault, abi: vaultAbi, functionName: 'claim', args: [allocationId, destination, deadline, signature], account: relayer,
      }));
    } catch (e) {
      console.error('claim simulation failed', e?.shortMessage || e);
      throw new HttpError(409, 'The vault rejected this claim. It may have just been claimed or expired.');
    }

    const txHash = await relayerClient().writeContract(request);
    await kvDel(`conf:${allocationId}`);
    try {
      const rc = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 20_000 });
      if (rc.status !== 'success') throw new HttpError(500, 'The claim transaction failed on chain.');
    } catch (e) {
      if (e instanceof HttpError) throw e; // timeout: the tx is sent, the page will show the hash
    }
    return { txHash };
  } finally {
    await kvDel(`lock:${allocationId}`).catch(() => {});
  }
});
