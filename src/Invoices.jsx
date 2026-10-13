import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAY, payAbi, publicClient, PAY_STATUS } from './chain.js';
import { loadInvoices, cleanError, fmtDate, shortAddr } from './lib.js';
import { formatEther } from 'viem';
import { Badge, copyText } from './ui.jsx';
import { Link } from './router.jsx';
import { payLink, money } from './invoiceLib.js';

const FILTERS = [['all', 'All'], ['open', 'Open'], ['paid', 'Paid'], ['closed', 'Closed']];
const inFilter = (f, s) => f === 'all' || (f === 'open' && s === 1) || (f === 'paid' && s === 2) || (f === 'closed' && (s === 3 || s === 4));

export default function Invoices({ acct, toast, embedded = false }) {
  const [list] = useState(() => loadInvoices(acct.address));
  const [status, setStatus] = useState({});
  const [busyId, setBusyId] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

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
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed. Refresh and try again.');
      toast('Invoice cancelled.');
      await load();
    } catch (e) {
      toast(cleanError(e));
    } finally {
      setBusyId('');
    }
  }

  const stats = useMemo(() => {
    let out = 0n, paid = 0n, nOpen = 0, nPaid = 0;
    list.forEach((i) => {
      const s = status[i.id]?.s;
      if (s === 1) { out += BigInt(i.amount); nOpen += 1; }
      if (s === 2) { paid += BigInt(i.amount); nPaid += 1; }
    });
    return { out, paid, nOpen, nPaid };
  }, [list, status]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return list.filter((i) => {
      const s = status[i.id]?.s;
      if (filter !== 'all' && !(s && inFilter(filter, s))) return false;
      if (!t) return true;
      return [i.d?.c, i.d?.e, i.note].some((x) => String(x || '').toLowerCase().includes(t));
    });
  }, [list, status, filter, q]);

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Customer', 'Email', 'Description', 'Amount (MON)', 'Status', 'Created', 'Due', 'Paid on', 'Paid by']];
    list.forEach((i) => {
      const st = status[i.id];
      rows.push([
        i.d?.c || '', i.d?.e || '', i.note, formatEther(BigInt(i.amount)), st ? PAY_STATUS[st.s] : '',
        new Date(i.createdAt).toISOString().slice(0, 10), i.expiresAt ? new Date(i.expiresAt * 1000).toISOString().slice(0, 10) : '',
        st?.s === 2 ? new Date(st.paidAt * 1000).toISOString().slice(0, 10) : '', st?.s === 2 ? st.payer : '',
      ]);
    });
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'fabrika-invoices.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  if (!list.length) {
    return <div className={embedded ? 'embed' : 'card'}>{!embedded && <h3>Invoices</h3>}<div className="hempty"><b>No invoices yet</b><span className="note" style={{ margin: 0 }}>Ask for an exact amount and share the link.</span><Link className="btn ghost sm" to="/invoice" style={{ width: 'auto' }}>Create an invoice</Link></div></div>;
  }

  return (
    <div className={embedded ? 'embed' : 'card'}>
      <div className={'card-head' + (embedded ? ' end' : '')}>{!embedded && <h3>Invoices</h3>}<span><button className="copy" type="button" onClick={load}>Refresh</button> <button className="copy" type="button" onClick={exportCsv}>Export CSV</button></span></div>
      <div className="inv-stats">
        <div><span>Outstanding</span><b>{money(stats.out)}</b><small>{stats.nOpen} open</small></div>
        <div><span>Paid</span><b>{money(stats.paid)}</b><small>{stats.nPaid} paid</small></div>
      </div>
      <div className="seg" role="tablist" aria-label="Filter invoices">
        {FILTERS.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or item" aria-label="Search invoices" autoComplete="off" />
      <div>
        {!shown.length && <p className="note" style={{ margin: 0 }}>No invoices match.</p>}
        {shown.map((inv) => {
          const st = status[inv.id];
          const link = payLink(inv.id, inv.d);
          return (
            <div className="act" key={inv.id}>
              <span className="t">{inv.d?.c ? `${inv.d.c} · ${inv.note}` : inv.note}</span>
              <span className="a">{money(inv.amount)}</span>
              <span className="s">
                {st ? <Badge>{PAY_STATUS[st.s]}</Badge> : '…'}
                {st && st.s === 2 && ` by ${shortAddr(st.payer)}, ${fmtDate(st.paidAt)}`}
                {st && st.s !== 2 && inv.expiresAt ? ` · due ${new Date(inv.expiresAt * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''}
              </span>
              <span className="links">
                <Link to={link.replace(location.origin, '')}>View</Link>
                {st && st.s === 1 && <button type="button" onClick={() => copyText(link, toast)}>Copy link</button>}
                {st && st.s === 1 && <button type="button" disabled={busyId === inv.id} onClick={() => cancel(inv.id)}>Cancel</button>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
