import { useState } from 'react';
import { formatEther } from 'viem';
import { ADDR, splitAbi, SPLIT_STATUS } from './abis.js';
import { chainNow, publicClient } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr, fmtDate } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, Bar, bytes, same } from './kit.jsx';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

// One RPC call for every slot. Falls back to single reads if multicall is not available.
async function readSlots(id, count) {
  const idx = Array.from({ length: count }, (_, i) => BigInt(i));
  try {
    return await publicClient.multicall({ contracts: idx.map((i) => ({ address: ADDR.split, abi: splitAbi, functionName: 'getSlot', args: [id, i] })), allowFailure: false });
  } catch {
    return Promise.all(idx.map((i) => read(ADDR.split, splitAbi, 'getSlot', [id, i])));
  }
}

const DUE = [['604800', '7 days'], ['2592000', '30 days'], ['86400', '1 day'], ['0', 'No deadline']];

export default function Split({ acct, toast }) {
  if (!ADDR.split) return <NotOn name="Split a bill" />;
  const id = param('s');
  return id ? <View acct={acct} id={id} toast={toast} /> : <Create acct={acct} toast={toast} />;
}

function Create({ acct, toast }) {
  const [total, setTotal] = useState('');
  const [people, setPeople] = useState('3');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('604800');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const t = parseAmount(total);
  const n = Number(people);
  const each = t && n >= 2 ? t / BigInt(n) : null;
  const mine = acct.address ? loadMine('split', acct.address) : [];

  async function submit() {
    const text = cleanNote(note, 120);
    if (!t) return tx.setErr('Enter the total bill, for example 30.');
    if (!Number.isInteger(n) || n < 2 || n > 50) return tx.setErr('Enter how many people share it, from 2 to 50.');
    if (!text) return tx.setErr('Say what the bill is for.');
    if (bytes(text) > 120) return tx.setErr('Keep the description under 120 characters.');
    if (!each || each === 0n) return tx.setErr('The amount is too small to split.');
    const id = randomId();
    const expiresAt = due === '0' ? 0n : BigInt((await chainNow()) + Number(due));
    const amounts = Array.from({ length: n - 1 }, () => each);
    const r = await tx.run('Creating…', (wc) => wc.writeContract({ address: ADDR.split, abi: splitAbi, functionName: 'createSplit', args: [id, amounts, expiresAt, text] }));
    if (!r) return;
    saveMine('split', acct.address, { id, title: text, at: Date.now() });
    setMade({ id, text, each, others: n - 1 });
  }

  if (made) {
    const url = `${location.origin}/split?s=${made.id}`;
    return (
      <Gate acct={acct} title="Split a bill">
        <section className="col">
          <div className="card">
            <Done title="Split ready" line={`${formatEther(made.each)} MON each from ${made.others} people`} />
            <p className="sub" style={{ margin: 0 }}>Send this to the group. Each person pays their share in one tap.</p>
            <Share url={url} text={`Split: ${made.text}. Your share is ${formatEther(made.each)} MON.`} toast={toast} />
          </div>
          <button className="btn ghost" type="button" onClick={() => { setMade(null); setTotal(''); setNote(''); }}>New split</button>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Split a bill">
      <section className="col">
        <div><h1 className="title">Split a bill</h1><p className="sub">You paid. Everyone else sends you their share.</p></div>
        <div className="card">
          <div className="field"><label htmlFor="sp-total">Total bill (MON)</label><input id="sp-total" value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" autoComplete="off" /></div>
          <div className="field"><label htmlFor="sp-n">People sharing, including you</label><input id="sp-n" value={people} onChange={(e) => setPeople(e.target.value)} inputMode="numeric" autoComplete="off" /></div>
          {each && <p className="callout">Each person pays {formatEther(each)} MON. You get it from {n - 1} people.</p>}
          <div className="field"><label htmlFor="sp-note">What is it for?</label><input id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} autoComplete="off" /></div>
          <div className="field"><label htmlFor="sp-due">Pay within</label><select id="sp-due" value={due} onChange={(e) => setDue(e.target.value)}>{DUE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Create split link'}</button>
          <Err>{tx.err}</Err>
        </div>
        {mine.length > 0 && (
          <div className="card"><h3>Your splits</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/split?s=${m.id}`}>{m.title}</Link></div>)}</div>
        )}
      </section>
    </Gate>
  );
}

function View({ acct, id, toast }) {
  const tx = useTx(acct);
  const valid = ID_RE.test(id);
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const s = await read(ADDR.split, splitAbi, 'getSplit', [id]);
    const count = Number(s[2]);
    const rows = await readSlots(id, count);
    return { creator: s[0], expiresAt: s[1], count, paidCount: Number(s[3]), status: Number(s[4]), note: s[5], rows };
  }, [id], 5000);

  if (!valid) return <section className="col"><p className="err">This link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.status === 0) return <section className="col"><p className="err">No split found for this link.</p></section>;

  const isCreator = same(acct.address, data.creator);
  const myIdx = data.rows.findIndex((r) => same(r[1], acct.address));
  const open = data.status === 1;
  const nextIdx = data.rows.findIndex((r) => r[1] === '0x0000000000000000000000000000000000000000');
  const amount = data.rows[0]?.[0] ?? 0n;
  const low = acct.balance != null && acct.balance < amount;

  async function pay() {
    // Someone else may take the slot first. Re-read, then pay the first one still open.
    const fresh = await readSlots(id, data.count);
    const idx = fresh.findIndex((r) => r[1] === '0x0000000000000000000000000000000000000000');
    if (idx < 0) { reload(); return tx.setErr('Everyone has already paid.'); }
    const r = await tx.run('Paying…', (wc) => wc.writeContract({ address: ADDR.split, abi: splitAbi, functionName: 'payShare', args: [id, BigInt(idx)], value: fresh[idx][0] }));
    if (r) { toast('Paid'); reload(); }
  }
  async function cancel() {
    const r = await tx.run('Cancelling…', (wc) => wc.writeContract({ address: ADDR.split, abi: splitAbi, functionName: 'cancel', args: [id] }));
    if (r) reload();
  }

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>Split</h3><Badge>{SPLIT_STATUS[data.status]}</Badge></div>
        <p className="sub" style={{ margin: 0 }}>{data.note}</p>
        <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(amount)}<small>MON each</small></div>
        <Bar value={BigInt(data.paidCount)} max={BigInt(data.count)} />
        <p className="note" style={{ margin: 0 }}>{data.paidCount} of {data.count} paid</p>
        <Row k="Pay to" v={isCreator ? 'You' : shortAddr(data.creator)} />
        <Row k="Pay by" v={Number(data.expiresAt) ? fmtDate(data.expiresAt) : 'No deadline'} />
        {data.rows.map((r, i) => r[1] !== '0x0000000000000000000000000000000000000000' && (
          <Row key={i} k={`Share ${i + 1}`} v={same(r[1], acct.address) ? 'You paid' : `${shortAddr(r[1])} paid`} />
        ))}
        {open && !isCreator && myIdx < 0 && nextIdx >= 0 && (
          !acct.authenticated
            ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to pay</button>
            : <button className="btn" type="button" onClick={pay} disabled={!!tx.busy || !acct.address || low}>{tx.busy || `Pay my share, ${formatEther(amount)} MON`}</button>
        )}
        {myIdx >= 0 && <p className="callout">You paid your share. Thanks.</p>}
        {low && open && !isCreator && myIdx < 0 && <p className="callout warn">You need more MON to pay this share.</p>}
        {open && isCreator && <><Share url={`${location.origin}/split?s=${id}`} text={`Split: ${data.note}.`} toast={toast} /><button className="btn ghost" type="button" onClick={cancel} disabled={!!tx.busy}>{tx.busy || 'Cancel this split'}</button></>}
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
