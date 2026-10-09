import { useCallback, useEffect, useState } from 'react';
import { PAY, payAbi, publicClient, PAY_STATUS } from './chain.js';
import { loadInvoices, payUrl, cleanError, fmtMon, fmtDate, shortAddr } from './lib.js';
import { Badge, copyText } from './ui.jsx';
import { Link } from './router.jsx';

export default function Invoices({ acct, toast }) {
  const [list] = useState(() => loadInvoices(acct.address));
  const [status, setStatus] = useState({});
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!PAY) return;
    const next = {};
    await Promise.all(list.map(async (inv) => {
      try {
        const r = await publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'getRequest', args: [inv.id] });
        next[inv.id] = { s: Number(r[3]), payer: r[4], paidAt: Number(r[5]) };
      } catch { /* leave unknown */ }
    }));
    setStatus((s) => ({ ...s, ...next }));
  }, [list]);

  useEffect(() => { load(); }, [load]);

  async function cancel(id) {
    setBusyId(id);
    try {
      const wc = await acct.getClient();
      const hash = await wc.writeContract({ address: PAY, abi: payAbi, functionName: 'cancel', args: [id] });
      await publicClient.waitForTransactionReceipt({ hash });
      toast('Invoice cancelled.');
      await load();
    } catch (e) {
      toast(cleanError(e));
    } finally {
      setBusyId('');
    }
  }

  if (!list.length) {
    return <div className="card"><h3>Invoices</h3><p className="note" style={{ margin: 0 }}>Nothing yet. <Link to="/invoice">Create an invoice</Link> and share the link.</p></div>;
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Invoices</h3><button className="copy" type="button" onClick={load}>Refresh</button></div>
      <div>
        {list.map((inv) => {
          const st = status[inv.id];
          return (
            <div className="act" key={inv.id}>
              <span className="t">{inv.note}</span>
              <span className="a">{fmtMon(BigInt(inv.amount))} MON</span>
              <span className="s">
                {st ? <Badge>{PAY_STATUS[st.s]}</Badge> : '…'}
                {st && st.s === 2 && ` by ${shortAddr(st.payer)}, ${fmtDate(st.paidAt)}`}
              </span>
              {st && st.s === 1 && (
                <span className="links">
                  <button type="button" onClick={() => copyText(payUrl(inv.id), toast)}>Copy link</button>
                  <button type="button" disabled={busyId === inv.id} onClick={() => cancel(inv.id)}>Cancel</button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
