import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { VAULT, vaultAbi, publicClient, explorer } from './chain.js';
import {
  parseLines, parseAmount, tagOf, randomId, saveBatch, saveTransfer, cleanError, fmtMon, shortAddr, KINDS, ADDR_RE,
} from './lib.js';
import { Stitch, Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Share from './Share.jsx';
import Gate from './Gate.jsx';

const EXPIRY = [['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days']];
const TYPES = [['telegram', 'Telegram'], ['x', 'X'], ['wallet', 'Wallet']];
const PLACEHOLDER = { telegram: '@ada 2.5\n@tunde 1\n@mike 0.5', x: '@ada 2.5\n@tunde 1\n@mike 0.5' };

export default function Transfer({ acct, toast }) {
  const [type, setType] = useState('telegram');
  return (
    <Gate acct={acct} title="Transfer">
      <section className="page">
        <div className="pane">
          <h2>Send money</h2>
          <p>Pick how you want to reach the person.</p>
          <div className="seg" role="tablist" aria-label="Recipient type">
            {TYPES.map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={type === v} onClick={() => setType(v)}>{l}</button>
            ))}
          </div>
        </div>
        {/* key resets the form when switching type */}
        {type === 'wallet'
          ? <WalletForm key="wallet" acct={acct} toast={toast} />
          : <HandleForm key={type} kind={type} acct={acct} toast={toast} />}
      </section>
    </Gate>
  );
}

function HandleForm({ kind, acct, toast }) {
  const label = KINDS[kind].label;
  const [text, setText] = useState('');
  const [exp, setExp] = useState('604800');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const { rows, errors } = useMemo(() => parseLines(text, kind), [text, kind]);
  const total = rows.reduce((s, r) => s + r.amount, 0n);
  const short = acct.balance != null && total > acct.balance;

  async function submit() {
    setErr('');
    if (!VAULT) return setErr('Vault address is not set.');
    if (!rows.length) return setErr('Add at least one recipient.');
    if (errors.length) return setErr(errors[0]);
    if (rows.length > 100) return setErr('Maximum 100 recipients per payout.');
    if (short) return setErr('Your balance is lower than the total.');
    try {
      setBusy('Confirm in your wallet…');
      const wc = await acct.getClient();
      const batchId = randomId();
      const ids = rows.map(() => randomId());
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + Number(exp));
      const hash = await wc.writeContract({
        address: VAULT,
        abi: vaultAbi,
        functionName: 'createBatch',
        args: [batchId, ids, rows.map((r) => tagOf(r.handle, kind)), rows.map((r) => r.amount), expiresAt],
        value: total,
      });
      setBusy('Locking funds on Monad…');
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed on chain.');
      const batch = {
        batchId, hash, kind, createdAt: Date.now(), expiresAt: Number(expiresAt),
        items: rows.map((r, i) => ({ id: ids[i], kind, handle: r.handle, amount: r.amount.toString() })),
      };
      saveBatch(acct.address, batch);
      setResult(batch);
      setText('');
      acct.refresh();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  if (result) {
    return (
      <div className="pane">
        <div className="tx" data-paid="1">
          <div className="slip-top"><span>Funds locked</span><Badge>Open</Badge></div>
          <Stitch />
          <p className="msg">Now send each person their link. They sign in and claim. <a href={explorer.tx(result.hash)} target="_blank" rel="noopener">View transaction</a></p>
        </div>
        <ul className="hist">
          {result.items.map((it) => (
            <li key={it.id}>
              <span className="t">@{it.handle} <em className="tag">{label}</em></span>
              <span className="a">{fmtMon(BigInt(it.amount))} MON</span>
              <Share id={it.id} kind={kind} handle={it.handle} amount={formatEther(BigInt(it.amount))} toast={toast} />
            </li>
          ))}
        </ul>
        <div className="row">
          <Link className="btn" to="/account">See payouts</Link>
          <button className="btn ghost" type="button" onClick={() => setResult(null)}>New payout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane">
      <p>One person per line. The total is locked in the vault until they claim.</p>
      <div className="field">
        <label htmlFor="list">{label} usernames and amounts</label>
        <textarea id="list" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER[kind]} autoCapitalize="off" autoComplete="off" spellCheck={false} />
      </div>
      {errors.length > 0 && <p className="err">{errors[0]}</p>}
      {rows.length > 0 && errors.length === 0 && (
        <div className="sum"><span>{rows.length} {rows.length === 1 ? 'person' : 'people'}</span><span><b>{formatEther(total)}</b> MON</span></div>
      )}
      <div className="field">
        <label htmlFor="exp">Unclaimed money returns to you after</label>
        <select id="exp" value={exp} onChange={(e) => setExp(e.target.value)}>
          {EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <button className="btn" type="button" onClick={submit} disabled={!!busy || !acct.address}>{busy || 'Lock funds and create links'}</button>
      <p className="err" role="alert">{err}</p>
    </div>
  );
}

function WalletForm({ acct, toast }) {
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
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
      setBusy('Confirm in your wallet…');
      const wc = await acct.getClient();
      const hash = await wc.sendTransaction({ to: address, value: amount });
      setBusy('Sending on Monad…');
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed on chain.');
      const t = { hash, to: address, amount: amount.toString(), at: Date.now() };
      saveTransfer(acct.address, t);
      setDone(t);
      setTo(''); setAmt('');
      acct.refresh();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  if (done) {
    return (
      <div className="pane">
        <div className="tx" data-paid="1">
          <div className="slip-top"><span>Sent</span><Badge>Done</Badge></div>
          <div className="slip-amt">{fmtMon(BigInt(done.amount))}<small>MON</small></div>
          <Stitch />
          <p className="msg">Sent to {shortAddr(done.to)}. <a href={explorer.tx(done.hash)} target="_blank" rel="noopener">View transaction</a></p>
        </div>
        <button className="btn ghost" type="button" onClick={() => setDone(null)}>Send another</button>
      </div>
    );
  }

  return (
    <div className="pane">
      <p>Goes straight to the wallet. There is no claim step and no refund, so check the address.</p>
      <div className="field">
        <label htmlFor="to">Wallet address</label>
        <input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" autoCapitalize="off" autoComplete="off" spellCheck={false} />
      </div>
      <div className="field">
        <label htmlFor="amt">Amount (MON)</label>
        <input id="amt" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="1.5" inputMode="decimal" autoComplete="off" />
      </div>
      <button className="btn" type="button" onClick={submit} disabled={!!busy}>{busy || 'Send'}</button>
      <p className="err" role="alert">{err}</p>
    </div>
  );
}
