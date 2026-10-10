import { useState } from 'react';
import { formatEther } from 'viem';
import { ADDR, streamAbi } from './abis.js';
import { chainNow } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr, fmtDate, ADDR_RE } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, Bar, same, nowSec, span, useTick } from './kit.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

const LEN = [[7, '1 week'], [30, '30 days'], [90, '90 days'], [365, '1 year']];

export default function Stream({ acct, toast }) {
  if (!ADDR.stream) return <NotOn name="Salary stream" />;
  const id = param('s');
  return id ? <View acct={acct} id={id} toast={toast} /> : <Create acct={acct} toast={toast} />;
}

function Create({ acct, toast }) {
  const [to, setTo] = useState('');
  const [total, setTotal] = useState('');
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const mine = acct.address ? loadMine('stream', acct.address) : [];
  const t = parseAmount(total);
  const secs = BigInt(days * 86400);
  const rate = t ? t / secs : 0n;
  const deposit = rate * secs;

  async function submit() {
    if (!ADDR_RE.test(to.trim())) return tx.setErr('Enter the wallet address of the person you pay.');
    if (!t || rate === 0n) return tx.setErr('Enter a larger total. It must be at least a few thousand wei per second.');
    const id = randomId();
    const start = BigInt((await chainNow()) + 30);
    const stop = start + secs;
    const text = cleanNote(note, 80);
    const r = await tx.run('Locking…', (wc) => wc.writeContract({
      address: ADDR.stream, abi: streamAbi, functionName: 'createStream',
      args: [id, to.trim(), rate, start, stop, text], value: deposit,
    }));
    if (!r) return;
    saveMine('stream', acct.address, { id, title: text || `Stream to ${shortAddr(to.trim())}`, at: Date.now() });
    setMade({ id, text });
  }

  if (made) {
    const url = `${location.origin}/stream?s=${made.id}`;
    return (
      <Gate acct={acct} title="Salary stream">
        <section className="col">
          <div className="card">
            <Done title="Stream started" line={`${formatEther(deposit)} MON over ${days} days`} />
            <p className="sub" style={{ margin: 0 }}>The full amount is locked. They can withdraw what has streamed at any time.</p>
            <Share url={url} text="Your pay is streaming. Open to see it and withdraw:" toast={toast} />
          </div>
          <button className="btn ghost" type="button" onClick={() => { setMade(null); setTotal(''); }}>New stream</button>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Salary stream">
      <section className="col">
        <div><h1 className="title">Pay by the second</h1><p className="sub">Lock the pay for a period. It reaches them every second.</p></div>
        <div className="card">
          <div className="field"><label htmlFor="s-to">Who gets paid (wallet address)</label><input id="s-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" autoComplete="off" /></div>
          <div className="field"><label htmlFor="s-t">Total for the period (MON)</label><input id="s-t" value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="300" autoComplete="off" /></div>
          <div className="field"><label htmlFor="s-d">Period</label><select id="s-d" value={days} onChange={(e) => setDays(Number(e.target.value))}>{LEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="s-n">Note (optional)</label><input id="s-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="October salary" maxLength={80} autoComplete="off" /></div>
          {rate > 0n && <p className="callout">You lock {formatEther(deposit)} MON now. About {formatEther(rate * 86400n)} MON streams each day.</p>}
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Start stream'}</button>
          <Err>{tx.err}</Err>
          <p className="note" style={{ margin: 0 }}>You can stop the stream any time. They keep what has streamed. You get the rest back.</p>
        </div>
        {mine.length > 0 && <div className="card"><h3>Your streams</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/stream?s=${m.id}`}>{m.title}</Link></div>)}</div>}
      </section>
    </Gate>
  );
}

function View({ acct, id, toast }) {
  const tx = useTx(acct);
  const valid = ID_RE.test(id);
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const [s, p, note] = await Promise.all([read(ADDR.stream, streamAbi, 'getStream', [id]), read(ADDR.stream, streamAbi, 'progressOf', [id]), read(ADDR.stream, streamAbi, 'noteOf', [id])]);
    return { payer: s[0], recipient: s[1], rate: s[2], start: Number(s[3]), stop: Number(s[4]), cancelled: p[0], streamed: p[1], withdrawn: p[2], note, at: nowSec() };
  }, [id], 10000);
  useTick(!!data && !data.cancelled);

  if (!valid) return <section className="col"><p className="err">This link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.payer === '0x0000000000000000000000000000000000000000') return <section className="col"><p className="err">Nothing found for this link.</p></section>;

  // Between chain reads, count forward from the last read so the number moves every second.
  const nowT = nowSec();
  const live = data.cancelled ? data.streamed : BigInt(Math.max(0, Math.min(nowT, data.stop) - data.start)) * data.rate;
  const total = data.rate * BigInt(data.stop - data.start);
  const available = live > data.withdrawn ? live - data.withdrawn : 0n;
  const isPay = same(acct.address, data.payer);
  const isGet = same(acct.address, data.recipient);
  const running = !data.cancelled && nowT < data.stop;
  const act = async (label, fn, msg) => { const r = await tx.run(label, fn); if (r) { toast(msg); reload(); } };
  const call = (fn) => (wc) => wc.writeContract({ address: ADDR.stream, abi: streamAbi, functionName: fn, args: [id] });

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>Salary stream</h3><span className="note" style={{ margin: 0 }}>{data.cancelled ? 'Stopped' : running ? 'Streaming' : 'Finished'}</span></div>
        {data.note && <p className="sub" style={{ margin: 0 }}>{data.note}</p>}
        <div className="slip-amt" style={{ margin: 0 }}>{Number(formatEther(live)).toFixed(6)}<small>MON streamed</small></div>
        <Bar value={live} max={total} />
        <Row k="From" v={isPay ? 'You' : shortAddr(data.payer)} />
        <Row k="To" v={isGet ? 'You' : shortAddr(data.recipient)} />
        <Row k="Total" v={`${fmtMon(total)} MON`} />
        <Row k="Per day" v={`${fmtMon(data.rate * 86400n, 6)} MON`} />
        <Row k="Withdrawn" v={`${fmtMon(data.withdrawn, 6)} MON`} />
        <Row k="Ends" v={fmtDate(data.stop)} />
        {running && <Row k="Time left" v={span(data.stop - nowT)} />}
        {isGet && (
          <>
            <button className="btn" type="button" onClick={() => act('Withdrawing…', call('withdraw'), 'Withdrawn')} disabled={!!tx.busy || available === 0n}>{tx.busy || `Withdraw ${Number(formatEther(available)).toFixed(6)} MON`}</button>
            {ADDR.savings && <p className="note" style={{ margin: 0 }}>Idle money can earn in <Link to="/save">Goal savings</Link>. Withdraw, then deposit.</p>}
          </>
        )}
        {isPay && running && <button className="btn ghost" type="button" onClick={() => act('Stopping…', call('cancel'), 'Stream stopped')} disabled={!!tx.busy}>{tx.busy || 'Stop stream'}</button>}
        {!acct.authenticated && <button className="btn ghost" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
