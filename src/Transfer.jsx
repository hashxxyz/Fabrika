import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { VAULT, vaultAbi, publicClient, chainNow } from './chain.js';
import {
  parseLines, parseAmount, normalizeHandle, tagOf, randomId, saveBatch, removeBatch, saveTransfer, cleanError, fmtMon, fmtDate, shortAddr, KINDS, ADDR_RE, cleanNote,
} from './lib.js';
import Share from './Share.jsx';
import Gate from './Gate.jsx';
import { pushHistory, saveLabel } from './history.js';
import { Link } from './router.jsx';
import { ReceiptCard } from './Receipt.jsx';

const EXPIRY = [['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days']];
const TYPES = [['telegram', 'Telegram'], ['x', 'X'], ['wallet', 'Wallet']];
const TG = 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';
const XP = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';
function TypeIcon({ k }) {
  if (k === 'wallet') return <svg className="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h2" /></svg>;
  return <svg className="tico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={k === 'x' ? XP : TG} /></svg>;
}
const secs = (t0) => Math.max(0.1, (performance.now() - t0) / 1000).toFixed(1);

export default function Transfer({ acct, toast }) {
  const [type, setType] = useState('telegram');
  return (
    <Gate acct={acct} title="Send money">
      <section className="col">
        <div>
          <h1 className="title">Send money</h1>
          <p className="sub">Choose how to reach them.</p>
        </div>
        <div className="seg" role="tablist" aria-label="Send to">
          {TYPES.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={type === v} onClick={() => setType(v)}><TypeIcon k={v} />{l}</button>
          ))}
        </div>
        {/* key resets the form when switching type */}
        {type === 'wallet'
          ? <WalletForm key="wallet" acct={acct} toast={toast} />
          : <HandleForm key={type} kind={type} acct={acct} toast={toast} />}
      </section>
    </Gate>
  );
}

const blank = () => ({ name: '', amt: '', note: '' });

function check(people, kind) {
  const k = KINDS[kind];
  const rows = [], rowErr = people.map(() => ''), seen = new Set();
  people.forEach((p, i) => {
    if (!p.name.trim() && !p.amt.trim()) return;
    const handle = normalizeHandle(p.name);
    const amount = parseAmount(p.amt);
    let e = '';
    if (!k.re.test(handle)) e = `That is not ${k.hint}.`;
    else if (!amount) e = 'Enter an amount, for example 1.5.';
    else if (seen.has(handle)) e = 'You added this person twice.';
    if (e) { rowErr[i] = e; return; }
    seen.add(handle);
    rows.push({ handle, amount, note: cleanNote(p.note) });
  });
  return { rows, rowErr };
}

function HandleForm({ kind, acct, toast }) {
  const label = KINDS[kind].label;
  const [people, setPeople] = useState([blank()]);
  const [paste, setPaste] = useState('');
  const [exp, setExp] = useState('604800');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const { rows, rowErr } = useMemo(() => check(people, kind), [people, kind]);
  const total = rows.reduce((s, r) => s + r.amount, 0n);
  const short = acct.balance != null && total > acct.balance;
  const set = (i, f, v) => setPeople((l) => l.map((p, j) => (j === i ? { ...p, [f]: v } : p)));

  function applyPaste() {
    const out = parseLines(paste, kind);
    if (out.errors.length) return setErr(out.errors[0]);
    if (!out.rows.length) return setErr('Add at least one line.');
    setErr('');
    setPeople(out.rows.map((r) => ({ name: r.handle, amt: formatEther(r.amount), note: '' })));
    setPaste('');
  }

  async function submit() {
    setErr('');
    setTried(true);
    if (!VAULT) return setErr('The payment contract address is not set.');
    if (rowErr.some(Boolean)) return setErr('Fix the highlighted rows first.');
    if (!rows.length) return setErr('Add at least one person and an amount.');
    if (rows.length > 100) return setErr('Maximum 100 people per payment.');
    if (short) return setErr('Your balance is lower than the total.');
    try {
      setBusy('Confirm…');
      const wc = await acct.getClient();
      const batchId = randomId();
      const ids = rows.map(() => randomId());
      const expiresAt = BigInt((await chainNow()) + Number(exp));
      const hash = await wc.writeContract({
        address: VAULT,
        abi: vaultAbi,
        functionName: 'createBatch',
        args: [batchId, ids, rows.map((r) => tagOf(r.handle, kind)), rows.map((r) => r.amount), expiresAt],
        value: total,
      });
      // Save the links the moment the tx is sent, so they survive a dropped connection or a closed tab.
      const batch = {
        batchId, hash, kind, createdAt: Date.now(), expiresAt: Number(expiresAt), took: '',
        items: rows.map((r, i) => ({ id: ids[i], kind, handle: r.handle, amount: r.amount.toString(), ...(r.note ? { note: r.note } : {}) })),
      };
      saveBatch(acct.address, batch);
      setBusy('Sending…');
      const t0 = performance.now();
      let rc;
      try {
        rc = await publicClient.waitForTransactionReceipt({ hash });
      } catch {
        throw new Error('We could not confirm the payment yet. It was saved to Account, where you can check its status and get the links.');
      }
      if (rc.status !== 'success') { removeBatch(acct.address, batchId); throw new Error('The transaction failed.'); }
      batch.took = secs(t0);
      saveBatch(acct.address, batch);
      pushHistory(acct, { type: 'payment', batchId, hash, kind, createdAt: batch.createdAt, expiresAt: batch.expiresAt, items: batch.items.map((i) => ({ id: i.id, handle: i.handle, note: i.note || '' })) });
      // Name the transaction in Wallet activity: the note if there is one shared description, else the first.
      const notes = [...new Set(batch.items.map((i) => i.note).filter(Boolean))];
      if (notes.length) saveLabel(acct, acct.address, `tx:${hash}`, notes.length === 1 ? notes[0] : `${notes[0]} +${notes.length - 1} more`);
      setResult(batch);
      setPeople([blank()]);
      setTried(false);
      acct.refresh();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  if (result) {
    return (
      <>
        <ReceiptCard
          title="Money is ready"
          amount={result.items.reduce((s, it) => s + BigInt(it.amount), 0n)}
          hash={result.hash} took={result.took} toast={toast}
          rows={[
            ['Recipients', `${result.items.length} ${result.items.length === 1 ? 'person' : 'people'}`],
            ['Returns to you after', fmtDate(result.expiresAt)],
          ]}
        />
        <p className="sub" style={{ margin: 0 }}>Send each person their link. They sign in and the money lands in their account.</p>
        <div className="card">
          {result.items.map((it) => (
            <div className="act" key={it.id} style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="t">@{it.handle}{it.note ? <span className="note"> · {it.note}</span> : null}</span>
              <span className="a">{fmtMon(BigInt(it.amount))} MON</span>
              <Share id={it.id} kind={kind} handle={it.handle} amount={formatEther(BigInt(it.amount))} note={it.note || ''} toast={toast} />
            </div>
          ))}
        </div>
        <div className="actions">
          <Link className="btn" to="/account">See activity</Link>
          <button className="btn ghost" type="button" onClick={() => setResult(null)}>Send more</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="card">
        <h3>Who gets paid</h3>
        {people.map((p, i) => (
          <div className="person" key={i}>
            <div className="at">
              <span>@</span>
              <input value={p.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder={`${label} username`} aria-label={`${label} username ${i + 1}`} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} />
            </div>
            {people.length > 1
              ? <button className="x-btn" type="button" aria-label="Remove person" onClick={() => setPeople((l) => l.filter((_, j) => j !== i))}>×</button>
              : <span />}
            <input value={p.amt} onChange={(e) => set(i, 'amt', e.target.value)} placeholder="Amount in MON" aria-label={`Amount ${i + 1}`} inputMode="decimal" autoComplete="off" />
            <input value={p.note} onChange={(e) => set(i, 'note', e.target.value)} placeholder="Description (optional), e.g. Lunch" aria-label={`Description ${i + 1}`} maxLength={80} autoComplete="off" />
            {rowErr[i] && (tried || (p.name && p.amt)) && <span className="person-err">{rowErr[i]}</span>}
          </div>
        ))}
        {people.length < 100 && <button className="add-btn" type="button" onClick={() => setPeople((l) => [...l, blank()])}>+ Add another person</button>}
        <details className="paste">
          <summary>Paste a list instead</summary>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'@ada 2.5\n@tunde 1\n@mike 0.5'} autoCapitalize="off" autoComplete="off" spellCheck={false} />
          <button className="btn ghost sm" type="button" onClick={applyPaste} style={{ marginTop: 8 }}>Use this list</button>
        </details>
      </div>

      <div className="card">
        <div className="sumrow"><span>{rows.length} {rows.length === 1 ? 'person' : 'people'}</span><b>{formatEther(total)} <small style={{ fontSize: 15, color: 'var(--ink-2)' }}>MON</small></b></div>
        <div className="field">
          <label htmlFor="exp">If they do not claim, return it to me after</label>
          <select id="exp" value={exp} onChange={(e) => setExp(e.target.value)}>
            {EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {kind === 'x' && <p className="callout">X usernames can be renamed. Use a short return time for larger amounts.</p>}
        <button className="btn" type="button" onClick={submit} disabled={!!busy || !acct.address}>{busy || 'Send'}</button>
        {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
        <p className="note" style={{ margin: 0 }}>Money is held safely until they claim. You can cancel any unclaimed payment from Account.</p>
      </div>
    </>
  );
}

function WalletForm({ acct, toast }) {
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const address = to.trim();
  const amount = parseAmount(amt);
  const short = amount != null && acct.balance != null && amount > acct.balance;

  async function submit() {
    setErr('');
    if (!ADDR_RE.test(address)) return setErr('Enter a full wallet address that starts with 0x.');
    if (address.toLowerCase() === acct.address.toLowerCase()) return setErr('That is your own wallet.');
    if (!amount) return setErr('Enter an amount, for example 1.5.');
    if (short) return setErr('Your balance is lower than this amount.');
    try {
      setBusy('Confirm…');
      const wc = await acct.getClient();
      const hash = await wc.sendTransaction({ to: address, value: amount });
      setBusy('Sending…');
      const t0 = performance.now();
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed.');
      const memo = cleanNote(note);
      const t = { hash, to: address, amount: amount.toString(), at: Date.now(), took: secs(t0), ...(memo ? { note: memo } : {}) };
      saveTransfer(acct.address, t);
      pushHistory(acct, { type: 'transfer', hash, note: memo });
      if (memo) saveLabel(acct, acct.address, `tx:${hash}`, memo);
      setDone(t);
      setTo(''); setAmt(''); setNote('');
      acct.refresh();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  if (done) {
    return (
      <>
        <ReceiptCard
          title="Money sent"
          amount={BigInt(done.amount)}
          hash={done.hash} took={done.took} toast={toast}
          rows={[['To', shortAddr(done.to)], done.note ? ['For', done.note] : null, ['From', shortAddr(acct.address)]]}
        />
        <button className="btn ghost" type="button" onClick={() => setDone(null)}>Send another</button>
      </>
    );
  }

  return (
    <div className="card">
      <h3>Send to a wallet</h3>
      <div className="field">
        <label htmlFor="to">Wallet address</label>
        <input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" autoCapitalize="off" autoComplete="off" spellCheck={false} />
      </div>
      <div className="field">
        <label htmlFor="amt">Amount (MON)</label>
        <input id="amt" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="1.5" inputMode="decimal" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="memo">Description (optional)</label>
        <input id="memo" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rent, May" maxLength={80} autoComplete="off" />
      </div>
      <p className="callout warn">This goes straight to the wallet. There is no claim step and no refund, so double-check the address.</p>
      <button className="btn" type="button" onClick={submit} disabled={!!busy}>{busy || 'Send'}</button>
      {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}
