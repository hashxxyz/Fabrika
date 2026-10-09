import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { VAULT, vaultAbi, publicClient, explorer } from './chain.js';
import { parseLines, tagOf, randomId, saveBatch, cleanError, fmtMon } from './lib.js';
import { Stitch, Badge } from './ui.jsx';
import Share from './Share.jsx';

const EXPIRY = [['86400', '1 day'], ['604800', '7 days'], ['2592000', '30 days']];

export default function Send({ acct, toast, onDone, goBatches }) {
  const [text, setText] = useState('');
  const [exp, setExp] = useState('604800');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const { rows, errors } = useMemo(() => parseLines(text), [text]);
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
        args: [batchId, ids, rows.map((r) => tagOf(r.handle)), rows.map((r) => r.amount), expiresAt],
        value: total,
      });
      setBusy('Locking funds on Monad…');
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed on chain.');
      const batch = {
        batchId, hash, createdAt: Date.now(), expiresAt: Number(expiresAt),
        items: rows.map((r, i) => ({ id: ids[i], handle: r.handle, amount: r.amount.toString() })),
      };
      saveBatch(acct.address, batch);
      setResult(batch);
      setText('');
      acct.refresh();
      onDone?.();
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
              <span className="t">@{it.handle}</span>
              <span className="a">{fmtMon(BigInt(it.amount))} MON</span>
              <Share id={it.id} handle={it.handle} amount={formatEther(BigInt(it.amount))} toast={toast} />
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="btn" type="button" onClick={goBatches}>See payouts</button>
          <button className="btn ghost" type="button" onClick={() => setResult(null)}>New payout</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane">
      <h2>Pay people by Telegram username</h2>
      <p>One person per line. The total is locked in the vault until they claim.</p>
      <div className="field">
        <label htmlFor="list">Recipients and amounts</label>
        <textarea id="list" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'@ada 2.5\n@tunde 1\n@mike 0.5'} autoCapitalize="off" autoComplete="off" spellCheck={false} />
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
