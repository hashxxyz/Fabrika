import { useEffect, useState } from 'react';
import { Stitch, Badge } from './ui.jsx';
import { Link } from './router.jsx';
import { fmtMon, shortAddr, recentActivity } from './lib.js';
import { FAUCET } from './chain.js';
import Pending from './Pending.jsx';

const SAMPLE = [['@ada', '2.5', 'Telegram'], ['@tunde', '1', 'X'], ['0x4f3a…91c2', '0.5', 'Wallet']];

export default function Home({ acct, toast }) {
  return acct.authenticated ? <Overview acct={acct} toast={toast} /> : <Landing acct={acct} />;
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
        <p className="lede">Send money to a Telegram or X username, or a wallet. They sign in with email, Google or X and it lands in their account. No app to install, no fees for them.</p>
        <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready} style={{ maxWidth: 320 }}>Get started</button>
        <div className="chips">
          <span className="chip">Fast on Monad</span>
          <span className="chip">No fees to claim</span>
          <span className="chip">Unclaimed money comes back</span>
        </div>
      </div>
      <div className="slip" data-paid={done === SAMPLE.length ? '1' : '0'} aria-label="Example payout">
        <div className="slip-top"><span>Payment to 3 people</span><Badge>{done === SAMPLE.length ? 'All received' : `${done} of 3 received`}</Badge></div>
        <div className="slip-amt">4.00<small>MON</small></div>
        <ul className="mini">
          {SAMPLE.map(([h, a, k], i) => (
            <li key={h}><span>{h} <em className="tag">{k}</em></span><span>{a} MON</span><span className={i < done ? 'ok' : ''}>{i < done ? 'Done' : 'Open'}</span></li>
          ))}
        </ul>
        <Stitch />
        <div className="slip-foot"><span>Example</span><span>Refundable after expiry</span></div>
      </div>
    </div>
  );
}

function Overview({ acct, toast }) {
  const recent = acct.address ? recentActivity(acct.address, 5) : [];
  return (
    <section className="col dash">
      <div className="balcard">
        <div className="k">Your balance</div>
        <div className="big"><span>{acct.balance == null ? '…' : fmtMon(acct.balance)}</span><small>MON</small></div>
        <div className="addr">{acct.address ? shortAddr(acct.address) : 'Setting up your account…'}</div>
      </div>
      <div className="actions">
        <Link className="btn" to="/transfer">Send money</Link>
        <Link className="btn ghost" to="/explore">Explore more</Link>
      </div>
      <Pending acct={acct} toast={toast} />
      <p className="note" style={{ margin: 0 }}>Need test MON? <a href={FAUCET} target="_blank" rel="noopener">Get some free</a>.</p>
      <div className="card">
        <div className="card-head"><h3>Recent activity</h3>{recent.length > 0 && <Link className="copy" to="/account">See all</Link>}</div>
        {recent.length === 0
          ? <p className="note" style={{ margin: 0 }}>Nothing yet. Send your first payment and it shows up here.</p>
          : <div>{recent.map((it) => (
            <div className="act" key={it.key}>
              <span className="t">{it.title}</span>
              <span className="a">{fmtMon(it.amount)} MON</span>
              <span className="s">{it.tag}</span>
            </div>
          ))}</div>}
      </div>
    </section>
  );
}
