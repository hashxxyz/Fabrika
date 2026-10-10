import { useState } from 'react';
import { saveTransfer, parseAmount, ADDR_RE, shortAddr, cleanNote, fmtMon } from './lib.js';
import { publicClient } from './chain.js';
import { param, useTx, Share, Done, Err } from './kit.jsx';
import Gate from './Gate.jsx';

const PRESETS = ['0.5', '1', '5'];

export default function Tip({ acct, toast }) {
  const to = param('to');
  return to ? <TipSend acct={acct} to={to} name={cleanNote(param('n'), 40)} toast={toast} /> : <TipLink acct={acct} toast={toast} />;
}

function TipLink({ acct, toast }) {
  const [name, setName] = useState('');
  const url = acct.address ? `${location.origin}/tip?to=${acct.address}${name.trim() ? `&n=${encodeURIComponent(cleanNote(name, 40))}` : ''}` : '';
  return (
    <Gate acct={acct} title="Tip link">
      <section className="col">
        <div>
          <h1 className="title">Your tip link</h1>
          <p className="sub">Put it in your bio. Fans tip you in one tap and it lands in your account.</p>
        </div>
        <div className="card">
          <div className="field">
            <label htmlFor="tip-name">Name to show (optional)</label>
            <input id="tip-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" maxLength={40} autoComplete="off" />
          </div>
          <Share url={url} text="Tip me:" toast={toast} />
        </div>
      </section>
    </Gate>
  );
}

function TipSend({ acct, to, name, toast }) {
  const [amt, setAmt] = useState('1');
  const [sent, setSent] = useState(null);
  const tx = useTx(acct);
  const valid = ADDR_RE.test(to);
  const who = name || shortAddr(to);
  const amount = parseAmount(amt);
  const low = amount && acct.balance != null && acct.balance < amount;

  async function send() {
    if (!valid) return tx.setErr('This tip link is not valid.');
    if (!amount) return tx.setErr('Enter an amount, for example 1.');
    const r = await tx.run('Sending…', (wc) => wc.sendTransaction({ to, value: amount }));
    if (!r) return;
    saveTransfer(acct.address, { hash: r.hash, to, amount: amount.toString(), note: 'Tip', at: Date.now() });
    setSent({ hash: r.hash });
    toast('Tip sent');
  }

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        {sent ? <Done title="Tip sent" line={`${fmtMon(amount)} MON to ${who}`} /> : (
          <>
            <div><h1 className="title">Tip {who}</h1><p className="sub">It goes straight to their wallet.</p></div>
            <div className="row">
              {PRESETS.map((p) => <button key={p} type="button" className={'btn sm' + (amt === p ? '' : ' ghost')} onClick={() => setAmt(p)}>{p} MON</button>)}
            </div>
            <div className="field">
              <label htmlFor="tip-amt">Amount (MON)</label>
              <input id="tip-amt" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" autoComplete="off" />
            </div>
            {!acct.authenticated
              ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to tip</button>
              : <button className="btn" type="button" onClick={send} disabled={!!tx.busy || !acct.address || low}>{tx.busy || `Tip ${amt || ''} MON`}</button>}
            {low && <p className="callout warn">You need more MON for this tip.</p>}
            <Err>{tx.err}</Err>
            <p className="note" style={{ margin: 0 }}>Tips are final. Only tip people you trust.</p>
          </>
        )}
      </div>
    </section>
  );
}
