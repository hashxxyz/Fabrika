import { useEffect, useState } from 'react';
import { Stitch, Badge } from './ui.jsx';

const SAMPLE = [['@ada', '2.5'], ['@tunde', '1'], ['@mike', '0.5']];

export default function Home({ acct }) {
  const [claimed, setClaimed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClaimed((c) => (c + 1) % (SAMPLE.length + 2)), 1600);
    return () => clearInterval(t);
  }, []);
  const done = Math.min(claimed, SAMPLE.length);

  return (
    <div className="hero-grid">
      <div>
        <h1>Pay anyone on Telegram.</h1>
        <p className="lede">Lock MON for a Telegram username. They sign in with Google or email and claim it. If they never do, you take it back.</p>
        <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready} style={{ maxWidth: 320 }}>Sign in to start</button>
        <p className="note" style={{ marginTop: 12 }}>Email, Google or a wallet you already have. Fabrika never holds your money. The vault contract does.</p>
      </div>
      <div className="slip" data-paid={done === SAMPLE.length ? '1' : '0'} aria-label="Example payout">
        <div className="slip-top"><span>Payout to 3 people</span><Badge>{done === SAMPLE.length ? 'All claimed' : `${done} of 3 claimed`}</Badge></div>
        <div className="slip-amt">4.00<small>MON</small></div>
        <ul className="mini">
          {SAMPLE.map(([h, a], i) => (
            <li key={h}><span>{h}</span><span>{a} MON</span><span className={i < done ? 'ok' : ''}>{i < done ? 'Claimed' : 'Open'}</span></li>
          ))}
        </ul>
        <Stitch />
        <div className="slip-foot"><span>Example payout</span><span>Refundable after expiry</span></div>
      </div>
    </div>
  );
}
