import { useEffect, useState } from 'react';
import { Stitch, Badge } from './ui.jsx';
import { Link } from './router.jsx';
import { fmtMon, shortAddr, loadBatches, KINDS } from './lib.js';

const SAMPLE = [['@ada', '2.5', 'Telegram'], ['@tunde', '1', 'X'], ['0x4f3a…91c2', '0.5', 'Wallet']];

export default function Home({ acct }) {
  return acct.authenticated ? <Overview acct={acct} /> : <Landing acct={acct} />;
}

function Landing({ acct }) {
  const [claimed, setClaimed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClaimed((c) => (c + 1) % (SAMPLE.length + 2)), 1600);
    return () => clearInterval(t);
  }, []);
  const done = Math.min(claimed, SAMPLE.length);

  return (
    <div className="hero-grid">
      <div>
        <h1>Pay anyone. Just a name.</h1>
        <p className="lede">Send MON to a Telegram username, an X username or a wallet address. Names are locked until the person signs in and claims. If they never do, you take it back.</p>
        <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready} style={{ maxWidth: 320 }}>Sign in to start</button>
        <p className="note" style={{ marginTop: 12 }}>Email, Google, X or a wallet you already have. Fabrika never holds your money. The vault contract does.</p>
      </div>
      <div className="slip" data-paid={done === SAMPLE.length ? '1' : '0'} aria-label="Example payout">
        <div className="slip-top"><span>Payout to 3 people</span><Badge>{done === SAMPLE.length ? 'All received' : `${done} of 3 received`}</Badge></div>
        <div className="slip-amt">4.00<small>MON</small></div>
        <ul className="mini">
          {SAMPLE.map(([h, a, k], i) => (
            <li key={h}><span>{h} <em className="tag">{k}</em></span><span>{a} MON</span><span className={i < done ? 'ok' : ''}>{i < done ? 'Done' : 'Open'}</span></li>
          ))}
        </ul>
        <Stitch />
        <div className="slip-foot"><span>Example payout</span><span>Refundable after expiry</span></div>
      </div>
    </div>
  );
}

function Overview({ acct }) {
  const recent = loadBatches(acct.address || '').flatMap((b) => b.items).slice(0, 4);
  return (
    <section className="page">
      <div className="pane wide">
        <h2>Welcome back</h2>
        <div className="wallet">
          <div>
            <div className="k">Balance</div>
            <div className="bal"><span className="n">{acct.balance == null ? '…' : fmtMon(acct.balance)}</span><span className="u">MON</span></div>
          </div>
          <div className="k">{acct.address ? shortAddr(acct.address) : 'Setting up your wallet…'}</div>
        </div>
        <div className="row">
          <Link className="btn" to="/transfer">Send money</Link>
          <Link className="btn ghost" to="/account">Account and payouts</Link>
        </div>
        {recent.length > 0 && (
          <>
            <p className="k" style={{ marginTop: 14 }}>Recent</p>
            <ul className="hist">
              {recent.map((it) => (
                <li key={it.id}>
                  <span className="t">@{it.handle} <em className="tag">{KINDS[it.kind || 'telegram'].label}</em></span>
                  <span className="a">{fmtMon(BigInt(it.amount))} MON</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
