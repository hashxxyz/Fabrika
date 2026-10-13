import { useEffect, useState } from 'react';
import { fmtMon } from './lib.js';
import { explorer } from './chain.js';

const ROWS = [
  ['usernames', 'Sent to usernames'],
  ['invoices', 'Invoices paid'],
  ['splits', 'Bill splits paid'],
  ['savings', 'Locked in goal savings'],
  ['direct', 'Sent to wallets'],
];
const NAMES = { vault: 'Payments vault', pay: 'Invoices', split: 'Bill splits', savings: 'Goal savings' };

// Public page: live totals for the whole product, read from the blockchain.
export default function Stats() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    const go = async () => {
      try {
        const r = await fetch('/api/stats');
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || 'Could not load the numbers. Try again.');
        if (live) { setD(j); setErr(''); }
      } catch (e) { if (live) setErr(e.message); }
    };
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <section className="col">
      <div>
        <h1 className="title">Fabrika in numbers</h1>
        <p className="sub">Live from Monad testnet. Test MON has no real value.</p>
      </div>
      {err && !d && <p className="callout warn">{err}</p>}
      {!d && !err && <p className="note">Loading the numbers…</p>}
      {d && (
        <>
          <div className="balcard">
            <div className="k">Total volume</div>
            <div className="big"><span>{fmtMon(BigInt(d.volume))}</span><small>MON</small></div>
            <div className="k">Everything people sent or locked through Fabrika</div>
          </div>
          <div className="hstats">
            <div className="hstat"><span>Payments</span><b>{d.payments.toLocaleString()}</b></div>
            <div className="hstat"><span>People</span><b>{d.people.toLocaleString()}</b></div>
            <div className="hstat"><span>Paid out or returned</span><b>{fmtMon(BigInt(d.paidOut))} MON</b></div>
            <div className="hstat"><span>Goals opened</span><b>{d.products.savings.count.toLocaleString()}</b></div>
          </div>
          <div className="card">
            <h3>Where it came from</h3>
            <div>
              {ROWS.map(([k, label]) => (
                <div className="set-row" key={k}>
                  <span>{label}</span>
                  <span>{fmtMon(BigInt(d.products[k].in))} MON</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Check it yourself</h3>
            <p className="note" style={{ margin: 0 }}>These numbers come from public contract events. Open any contract on the explorer.</p>
            <div>
              {Object.entries(d.contracts).map(([k, a]) => (
                <div className="set-row" key={k}>
                  <span>{NAMES[k] || k}</span>
                  <a href={explorer.address(a)} target="_blank" rel="noopener noreferrer">View</a>
                </div>
              ))}
            </div>
          </div>
          <p className="note">
            Updated {new Date(d.updatedAt).toLocaleTimeString()}.
            {d.partial ? ' Very busy contracts are cut at 10,000 events, so the totals may be a little low.' : ''}
            {' '}Wallet sends count from the day tracking went live.
          </p>
        </>
      )}
    </section>
  );
}
