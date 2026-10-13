import { useEffect, useState } from 'react';
import { Stitch, Badge, BalanceEye, useHideBalance } from './ui.jsx';
import { Link } from './router.jsx';
import { fmtMon, shortAddr, recentActivity } from './lib.js';
import { FAUCET, PAY } from './chain.js';
import { ADDR } from './abis.js';
import Pending from './Pending.jsx';

const SAMPLE = [['@telegram_user', '2.5', 'Telegram'], ['@x_user', '1', 'X'], ['0x4f3a…91c2', '0.5', 'Wallet']];

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

const q = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ACTIONS = [
  { to: '/transfer', label: 'Send', fill: true, on: true, icon: q(<path d="M5 12h14M13 6l6 6-6 6" />) },
  { to: '/save', label: 'Save', fill: true, on: !!ADDR.savings, icon: q(<><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="12" cy="12" r="2.5" /></>) },
  { to: '/invoice', label: 'Invoice', fill: true, on: !!PAY, icon: q(<><path d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>) },
  { to: '/split', label: 'Split', fill: true, on: !!ADDR.split, icon: q(<><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M2.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 15c2.6-.4 4.7.8 5.5 3.5" /></>) },
  { to: '/account', label: 'History', icon: q(<><path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4" /><path d="M12 8v4l3 2" /></>) },
  { to: '/docs', label: 'Guide', icon: q(<><path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z" /><path d="M9 9h5M9 13h5" /></>) },
  { href: FAUCET, label: 'Add funds', icon: q(<path d="M12 3s6 6.2 6 10.5a6 6 0 11-12 0C6 9.2 12 3 12 3z" />) },
];

function Overview({ acct, toast }) {
  const recent = acct.address ? recentActivity(acct.address, 5) : [];
  const { hidden, toggle } = useHideBalance();
  const [spin, setSpin] = useState(false);
  const doRefresh = async () => {
    if (spin) return;
    setSpin(true);
    try { await acct.refresh(); } finally { setTimeout(() => setSpin(false), 500); }
  };
  const who = acct.label ? (acct.label.split('@')[0] || acct.label) : '';
  return (
    <section className="col home">
      {who && <h1 className="title">Hi, {who}</h1>}
      <div className="balcard">
        <div className="balrow"><div className="k">Your balance</div><div className="balbtns">
            <button className="eye" type="button" onClick={doRefresh} disabled={!acct.address} aria-label="Refresh balance" title="Refresh balance">
              <svg className={spin ? 'spin' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" />
              </svg>
            </button>
            <BalanceEye hidden={hidden} onToggle={toggle} />
          </div></div>
        <div className="big"><span aria-label={hidden ? 'Balance hidden' : undefined}>{acct.balance == null ? '…' : hidden ? '••••' : fmtMon(acct.balance)}</span><small>MON</small></div>
        <div className="addr">
          <span>{acct.address ? shortAddr(acct.address) : 'Setting up your account…'}</span>
          <a className="copy" href={FAUCET} target="_blank" rel="noopener">Add funds</a>
        </div>
      </div>

      <nav className="qa" aria-label="Quick actions">
        {ACTIONS.map((a) => {
          const body = <><span className={'ic' + (a.fill ? ' fill' : '')}>{a.icon}</span><span>{a.label}</span></>;
          if (a.href) return <a key={a.label} href={a.href} target="_blank" rel="noopener">{body}</a>;
          return <Link key={a.label} to={a.to} data-off={a.on === false ? '1' : undefined}>{body}</Link>;
        })}
      </nav>

      <Pending acct={acct} toast={toast} />

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
