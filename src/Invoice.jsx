import { useMemo, useState } from 'react';
import { PAY, payAbi, publicClient, chainNow } from './chain.js';
import { randomId, saveInvoice, cleanError } from './lib.js';
import { copyText } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';
import { pushHistory } from './history.js';
import {
  MAX_ITEMS, totals, parseQty, parseAmount, makeDetails, chainNote, nextNumber, bumpNumber, loadBiz, saveBiz, payLink, money,
} from './invoiceLib.js';

const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const blankItem = () => ({ d: '', q: '1', p: '' });

export default function Invoice({ acct, toast }) {
  const saved = useMemo(loadBiz, []);
  const [biz, setBiz] = useState(saved.name || '');
  const [no, setNo] = useState(nextNumber);
  const [cust, setCust] = useState('');
  const [email, setEmail] = useState('');
  const [items, setItems] = useState([blankItem()]);
  const [disc, setDisc] = useState('');
  const [notes, setNotes] = useState(saved.notes || '');
  const [due, setDue] = useState(inDays(7));
  const [noDue, setNoDue] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [made, setMade] = useState(null);

  const setItem = (i, k, v) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  // Live totals from whatever is valid so far.
  const live = useMemo(() => {
    const ok = items.map((i) => ({ d: i.d, q: parseQty(i.q), p: parseAmount(i.p) })).filter((i) => i.q && i.p);
    const dw = disc.trim() ? parseAmount(disc) || 0n : 0n;
    return totals(ok, 0, dw);
  }, [items, disc]);

  async function submit() {
    setErr('');
    if (!PAY) return setErr('Invoices are not switched on yet.');
    const rows = [];
    for (let n = 0; n < items.length; n++) {
      const i = items[n];
      if (!i.d.trim() && !i.p.trim()) continue;
      const q = parseQty(i.q), p = parseAmount(i.p);
      if (!i.d.trim()) return setErr(`Line ${n + 1}: say what it is.`);
      if (!q) return setErr(`Line ${n + 1}: quantity must be a whole number, for example 1.`);
      if (!p) return setErr(`Line ${n + 1}: enter a price, for example 25.`);
      rows.push({ d: i.d.trim(), q, p });
    }
    if (!rows.length) return setErr('Add at least one item.');
    const discount = disc.trim() ? parseAmount(disc) : 0n;
    if (discount === null) return setErr('Discount must be an amount in MON, for example 5.');
    const { sub, disc: dApplied, total } = totals(rows, 0, discount);
    if (discount > sub) return setErr('The discount is bigger than the items total.');
    if (total <= 0n) return setErr('The total must be more than zero.');
    if (!no.trim()) return setErr('Give the invoice a number.');
    try {
      setBusy('Confirm…');
      const wc = await acct.getClient();
      const id = randomId();
      let expiresAt = 0n;
      if (!noDue) {
        const end = new Date(`${due}T23:59:59`);
        if (isNaN(end)) throw new Error('Pick a due date.');
        expiresAt = BigInt(Math.floor(end.getTime() / 1000));
        if (Number(expiresAt) <= (await chainNow()) + 60) throw new Error('The due date must be in the future.');
      }
      const note = chainNote(no.trim(), rows);
      const hash = await wc.writeContract({ address: PAY, abi: payAbi, functionName: 'createRequest', args: [id, total, expiresAt, note] });
      setBusy('Creating…');
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed.');
      const d = makeDetails({ biz, no, name: cust, email, items: rows, taxBps: 0, discount: dApplied, notes, issued: Math.floor(Date.now() / 1000) });
      const inv = { id, hash, amount: total.toString(), note, createdAt: Date.now(), expiresAt: Number(expiresAt), d };
      saveInvoice(acct.address, inv);
      saveBiz({ name: biz.trim(), notes });
      bumpNumber(no);
      pushHistory(acct, { type: 'invoice', id });
      setMade(inv);
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  function again() {
    setMade(null); setNo(nextNumber()); setCust(''); setEmail(''); setItems([blankItem()]); setDisc(''); setDue(inDays(7)); setNoDue(false);
  }

  if (made) {
    const url = payLink(made.id, made.d);
    const text = `${made.d.b ? `${made.d.b}: ` : ''}Invoice ${made.d.n} for ${money(made.amount)}. Pay here:`;
    const mail = made.d.e ? `mailto:${made.d.e}?subject=${encodeURIComponent(`Invoice ${made.d.n}${made.d.b ? ` from ${made.d.b}` : ''}`)}&body=${encodeURIComponent(`${text}\n\n${url}`)}` : '';
    return (
      <Gate acct={acct} title="Invoice">
        <section className="col">
          <div className="card">
            <div className="done-top">
              <span className="okmark">{CHECK}</span>
              <h2>Invoice {made.d.n} ready</h2>
              <span className="speed">{money(made.amount)}{made.d.c ? ` · ${made.d.c}` : ''}</span>
            </div>
            <p className="sub" style={{ margin: 0 }}>Send this link. They see the full invoice, pay in one tap, and it lands in your account.</p>
            <code className="callout" style={{ overflowWrap: 'anywhere' }}>{url.length > 140 ? `${url.slice(0, 90)}…` : url}</code>
            <div className="actions">
              <button className="btn" type="button" onClick={() => copyText(url, toast)}>Copy link</button>
              <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener">WhatsApp</a>
            </div>
            <div className="actions">
              <a className="btn ghost" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">Telegram</a>
              {mail ? <a className="btn ghost" href={mail}>Email</a> : <Link className="btn ghost" to={url.replace(location.origin, '')}>Preview</Link>}
            </div>
          </div>
          <div className="actions">
            <Link className="btn ghost" to="/account">See invoices</Link>
            <button className="btn ghost" type="button" onClick={again}>New invoice</button>
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
          <p className="sub">Add items and a due date. Share one link and get paid.</p>
        </div>

        <div className="card">
          <h3>From</h3>
          <div className="field">
            <label htmlFor="inv-biz">Your name or business</label>
            <input id="inv-biz" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Ada Studio" maxLength={60} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-no">Invoice number</label>
            <input id="inv-no" value={no} onChange={(e) => setNo(e.target.value)} maxLength={24} autoComplete="off" />
          </div>
        </div>

        <div className="card">
          <h3>Bill to</h3>
          <div className="field">
            <label htmlFor="inv-cust">Customer name</label>
            <input id="inv-cust" value={cust} onChange={(e) => setCust(e.target.value)} placeholder="Tunde Bakare" maxLength={60} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="inv-email">Customer email (optional)</label>
            <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tunde@example.com" maxLength={80} autoComplete="off" />
          </div>
        </div>

        <div className="card">
          <h3>Items</h3>
          {items.map((it, i) => (
            <div className="li" key={i}>
              <input className="li-d" aria-label={`Item ${i + 1} description`} value={it.d} onChange={(e) => setItem(i, 'd', e.target.value)} placeholder="Logo design" maxLength={80} autoComplete="off" />
              <input aria-label="Quantity" value={it.q} onChange={(e) => setItem(i, 'q', e.target.value)} placeholder="Qty" inputMode="numeric" autoComplete="off" />
              <input aria-label="Price each in MON" value={it.p} onChange={(e) => setItem(i, 'p', e.target.value)} placeholder="Price (MON)" inputMode="decimal" autoComplete="off" />
              <button className="li-x" type="button" aria-label={`Remove item ${i + 1}`} disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="btn ghost" type="button" disabled={items.length >= MAX_ITEMS} onClick={() => setItems((xs) => [...xs, blankItem()])}>Add item</button>
          <div className="field">
            <label htmlFor="inv-disc">Discount (MON)</label>
            <input id="inv-disc" value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="0" inputMode="decimal" autoComplete="off" />
          </div>
          <div>
            <div className="set-row"><span>Subtotal</span><span>{money(live.sub)}</span></div>
            {live.disc > 0n && <div className="set-row"><span>Discount</span><span>−{money(live.disc)}</span></div>}
            <div className="set-row"><span><b>Total due</b></span><span><b>{money(live.total)}</b></span></div>
          </div>
        </div>

        <div className="card">
          <h3>Due date and notes</h3>
          <div className="field">
            <label htmlFor="inv-due">Pay by</label>
            <input id="inv-due" type="date" value={due} min={inDays(1)} onChange={(e) => setDue(e.target.value)} disabled={noDue} />
          </div>
          <label className="check"><input type="checkbox" checked={noDue} onChange={(e) => setNoDue(e.target.checked)} /> No deadline</label>
          <div className="field">
            <label htmlFor="inv-notes">Notes or payment terms (optional)</label>
            <textarea id="inv-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you. Work starts once paid." maxLength={300} />
          </div>
          <button className="btn" type="button" onClick={submit} disabled={!!busy || !acct.address}>{busy || `Create invoice · ${money(live.total)}`}</button>
          {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <p className="note" style={{ margin: 0 }}>The payer cannot pay a different amount and cannot pay after the due date. You can cancel an unpaid invoice any time.</p>
        </div>
      </section>
    </Gate>
  );
}
