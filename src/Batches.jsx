import { useCallback, useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { VAULT, vaultAbi, publicClient, explorer, STATUS } from './chain.js';
import { loadBatches, cleanError, fmtMon, fmtDate } from './lib.js';
import { Badge } from './ui.jsx';
import Share from './Share.jsx';

export default function Batches({ acct, toast }) {
  const [batches] = useState(() => loadBatches(acct.address));
  const [status, setStatus] = useState({});
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!VAULT) return;
    setLoading(true);
    const next = {};
    await Promise.all(batches.flatMap((b) => b.items).map(async (it) => {
      try {
        const r = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'getAllocation', args: [it.id] });
        next[it.id] = Number(r[5]);
      } catch { /* leave unknown */ }
    }));
    setStatus((s) => ({ ...s, ...next }));
    setLoading(false);
  }, [batches]);

  useEffect(() => { load(); }, [load]);

  async function act(fn, id) {
    setBusyId(id);
    try {
      const wc = await acct.getClient();
      const hash = await wc.writeContract({ address: VAULT, abi: vaultAbi, functionName: fn, args: [id] });
      await publicClient.waitForTransactionReceipt({ hash });
      toast(fn === 'cancel' ? 'Cancelled. Funds returned.' : 'Refunded.');
      acct.refresh();
      await load();
    } catch (e) {
      toast(cleanError(e));
    } finally {
      setBusyId('');
    }
  }

  if (!batches.length) {
    return <div className="pane"><h2>Payouts</h2><p className="empty">No payouts from this device yet. Create one and it shows up here with live status from the vault.</p></div>;
  }

  return (
    <div className="pane wide">
      <div className="head-row"><h2>Payouts</h2><button className="copy" type="button" onClick={load} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button></div>
      <p>Status comes from the vault on Monad. Names are saved on this device only.</p>
      {batches.map((b) => {
        const total = b.items.reduce((s, it) => s + BigInt(it.amount), 0n);
        const claimed = b.items.filter((it) => status[it.id] === 2).length;
        return (
          <div className="batch" key={b.batchId}>
            <div className="batch-top">
              <span>{fmtDate(b.createdAt / 1000)}</span>
              <span>{formatEther(total)} MON · {claimed} of {b.items.length} claimed</span>
            </div>
            <ul className="hist">
              {b.items.map((it) => {
                const s = status[it.id];
                return (
                  <li key={it.id}>
                    <span className="t">@{it.handle}</span>
                    <span className="a">{fmtMon(BigInt(it.amount))} MON</span>
                    <span className="links">
                      <Badge>{s == null ? '…' : STATUS[s]}</Badge>
                      {s === 1 && <Share id={it.id} handle={it.handle} amount={formatEther(BigInt(it.amount))} toast={toast} />}
                      {s === 1 && <button type="button" disabled={busyId === it.id} onClick={() => act('cancel', it.id)}>Cancel</button>}
                      {s === 5 && <button type="button" disabled={busyId === it.id} onClick={() => act('refund', it.id)}>Take back</button>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="note"><a href={explorer.tx(b.hash)} target="_blank" rel="noopener">Transaction</a> · returns to you after {fmtDate(b.expiresAt)}</p>
          </div>
        );
      })}
    </div>
  );
}
