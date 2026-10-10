import { useState } from 'react';
import { formatEther } from 'viem';
import { PAY, payAbi, publicClient, chainNow } from './chain.js';
import { parseAmount, randomId, saveInvoice, payUrl, cleanError } from './lib.js';
import { copyText } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';
import { pushHistory } from './history.js';

const DUE = [['604800', '7 days'], ['2592000', '30 days'], ['259200', '3 days'], ['0', 'No deadline']];
const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const bytes = (s) => new TextEncoder().encode(s).length;

export default function Invoice({ acct, toast }) {
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('604800');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [made, setMade] = useState(null);

  async function submit() {
    setErr('');
    const amount = parseAmount(amt);
    const text = note.trim();
    if (!PAY) return setErr('Invoices are not switched on yet.');
    if (!amount) return setErr('Enter an amount, for example 25.');
    if (!text) return setErr('Say what the invoice is for.');
    if (bytes(text) > 120) return setErr('Keep the description under 120 characters.');
    try {
      setBusy('Confirm…');
      const wc = await acct.getClient();
      const id = randomId();
      const expiresAt = due === '0' ? 0n : BigInt((await chainNow()) + Number(due));
      const hash = await wc.writeContract({ address: PAY, abi: payAbi, functionName: 'createRequest', args: [id, amount, expiresAt, text] });
      setBusy('Creating…');
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed.');
      const inv = { id, hash, amount: amount.toString(), note: text, createdAt: Date.now(), expiresAt: Number(expiresAt) };
      saveInvoice(acct.address, inv);
      pushHistory(acct, { type: 'invoice', id });
      setMade(inv);
      setAmt(''); setNote('');
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  if (made) {
    const url = payUrl(made.id);
    const text = `Invoice: ${formatEther(BigInt(made.amount))} MON for ${made.note}. Pay here:`;
    return (
      <Gate acct={acct} title="Invoice">
        <section className="col">
          <div className="card">
            <div className="done-top">
              <span className="okmark">{CHECK}</span>
              <h2>Invoice ready</h2>
              <span className="speed">{formatEther(BigInt(made.amount))} MON · {made.note}</span>
            </div>
            <p className="sub" style={{ margin: 0 }}>Send this link. They open it, pay in one tap, and it lands in your account.</p>
            <code className="callout" style={{ overflowWrap: 'anywhere' }}>{url}</code>
            <div className="actions">
              <button className="btn" type="button" onClick={() => copyText(url, toast)}>Copy link</button>
              <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener">WhatsApp</a>
            </div>
            <a className="btn ghost" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">Telegram</a>
          </div>
          <div className="actions">
            <Link className="btn ghost" to="/account">See invoices</Link>
            <button className="btn ghost" type="button" onClick={() => setMade(null)}>New invoice</button>
          </div>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Invoice">
      <section className="col">
        <div>
          <h1 className="title">Create an invoice</h1>
          <p className="sub">Ask for an exact amount. Share the link and get paid.</p>
        </div>
        <div className="card">
          <div className="field">
            <label htmlFor="inv-amt">Amount (MON)</label>
            <input id="inv-amt" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="25" inputMode="decimal" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-note">What is it for?</label>
            <input id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Logo design, week 1" maxLength={120} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-due">Pay within</label>
            <select id="inv-due" value={due} onChange={(e) => setDue(e.target.value)}>
              {DUE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn" type="button" onClick={submit} disabled={!!busy || !acct.address}>{busy || 'Create invoice'}</button>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <p className="note" style={{ margin: 0 }}>The payer cannot pay the wrong amount, and cannot pay after the deadline. You can cancel an unpaid invoice any time.</p>
        </div>
      </section>
    </Gate>
  );
}
