import { useState } from 'react';
import { formatEther } from 'viem';
import { ADDR, pledgeAbi, PLEDGE_PHASE } from './abis.js';
import { chainNow } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr, fmtDate, ADDR_RE } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, same, dayEnd, todayStr, nowSec, span, useTick } from './kit.jsx';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

const JOIN = [['86400', '1 day'], ['259200', '3 days'], ['604800', '7 days']];

export default function Pledge({ acct, toast }) {
  if (!ADDR.pledge) return <NotOn name="Commitments and pools" />;
  const id = param('p');
  return id ? <View acct={acct} id={id} toast={toast} /> : <Create acct={acct} toast={toast} />;
}

function Create({ acct, toast }) {
  const [kind, setKind] = useState('solo');
  const [title, setTitle] = useState('');
  const [stake, setStake] = useState('');
  const [end, setEnd] = useState('');
  const [judge, setJudge] = useState('');
  const [dest, setDest] = useState('');
  const [join, setJoin] = useState('259200');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const mine = acct.address ? loadMine('pledge', acct.address) : [];

  async function submit() {
    const amount = parseAmount(stake);
    const text = cleanNote(title, 120);
    const endsAt = dayEnd(end);
    const now = await chainNow();
    if (!text) return tx.setErr('Say what the goal is.');
    if (!amount) return tx.setErr('Enter your stake, for example 10.');
    if (!endsAt || endsAt <= now) return tx.setErr('Pick an end date in the future.');
    if (!ADDR_RE.test(judge.trim())) return tx.setErr('Enter the wallet address of your judge. This is the person who says if you made it.');
    if (!ADDR_RE.test(dest.trim())) return tx.setErr('Enter the wallet address that gets the stake if you fail.');
    if (same(judge.trim(), acct.address)) return tx.setErr('You cannot be your own judge.');
    const joinBy = kind === 'solo' ? now : Math.min(now + Number(join), endsAt);
    const id = randomId();
    const r = await tx.run('Locking…', (wc) => wc.writeContract({
      address: ADDR.pledge, abi: pledgeAbi, functionName: 'createPool',
      args: [id, judge.trim(), dest.trim(), BigInt(joinBy), BigInt(endsAt), text], value: amount,
    }));
    if (!r) return;
    saveMine('pledge', acct.address, { id, title: text, at: Date.now() });
    setMade({ id, text, amount, kind });
  }

  if (made) {
    const url = `${location.origin}/pledge?p=${made.id}`;
    return (
      <Gate acct={acct} title="Commitment">
        <section className="col">
          <div className="card">
            <Done title={made.kind === 'solo' ? 'Commitment locked' : 'Pool open'} line={`${formatEther(made.amount)} MON staked`} />
            {made.kind === 'pool'
              ? <><p className="sub" style={{ margin: 0 }}>Invite people. Each stakes the same amount. At the end, the judge says who finished.</p><Share url={url} text={`Join my pool: ${made.text}. Stake ${formatEther(made.amount)} MON.`} toast={toast} /></>
              : <p className="sub" style={{ margin: 0 }}>Your judge confirms the result at the end. Share the link with them so they can find it.</p>}
            {made.kind === 'solo' && <Share url={url} text={`You are my judge for: ${made.text}.`} toast={toast} />}
          </div>
          <button className="btn ghost" type="button" onClick={() => { setMade(null); setTitle(''); setStake(''); }}>New one</button>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Commitment">
      <section className="col">
        <div><h1 className="title">Put money on it</h1><p className="sub">Stake MON on a goal. Finish and you get it back. Quit and you lose it.</p></div>
        <div className="card">
          <div className="seg" role="tablist" aria-label="Kind">
            <button type="button" role="tab" aria-selected={kind === 'solo'} onClick={() => setKind('solo')}>Just me</button>
            <button type="button" role="tab" aria-selected={kind === 'pool'} onClick={() => setKind('pool')}>Group pool</button>
          </div>
          <div className="field"><label htmlFor="p-t">Goal</label><input id="p-t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Under 2 hours of screen time a day" maxLength={120} autoComplete="off" /></div>
          <div className="field"><label htmlFor="p-s">{kind === 'pool' ? 'Stake per person (MON)' : 'Your stake (MON)'}</label><input id="p-s" value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" placeholder="10" autoComplete="off" /></div>
          <div className="field"><label htmlFor="p-e">Ends on</label><input id="p-e" type="date" min={todayStr(1)} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          {kind === 'pool' && <div className="field"><label htmlFor="p-j">People can join for</label><select id="p-j" value={join} onChange={(e) => setJoin(e.target.value)}>{JOIN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          <div className="field"><label htmlFor="p-jd">Judge (wallet address)</label><input id="p-jd" value={judge} onChange={(e) => setJudge(e.target.value)} placeholder="A friend you trust, or a bot wallet you run" autoComplete="off" /></div>
          <div className="field"><label htmlFor="p-d">{kind === 'pool' ? 'If nobody finishes, send stakes to' : 'If you fail, send your stake to'}</label><input id="p-d" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="0x… a friend, a cause, or the rewards pool" autoComplete="off" /></div>
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Lock my stake'}</button>
          <Err>{tx.err}</Err>
          <p className="note" style={{ margin: 0 }}>The judge decides who succeeded. Pick someone you trust. If the judge does nothing for 7 days after the end date, everyone gets their stake back.</p>
        </div>
        {mine.length > 0 && <div className="card"><h3>Yours</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/pledge?p=${m.id}`}>{m.title}</Link></div>)}</div>}
      </section>
    </Gate>
  );
}

function View({ acct, id, toast }) {
  const tx = useTx(acct);
  const [picked, setPicked] = useState({});
  const valid = ID_RE.test(id);
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const [p, t, title, members] = await Promise.all([
      read(ADDR.pledge, pledgeAbi, 'getPool', [id]), read(ADDR.pledge, pledgeAbi, 'timesOf', [id]),
      read(ADDR.pledge, pledgeAbi, 'titleOf', [id]), read(ADDR.pledge, pledgeAbi, 'membersOf', [id]),
    ]);
    const states = await Promise.all(members.map((m) => read(ADDR.pledge, pledgeAbi, 'stateOf', [id, m])));
    return { creator: p[0], judge: p[1], beneficiary: p[2], stake: p[3], phase: Number(p[4]), joinBy: Number(t[0]), endsAt: Number(t[1]), count: Number(t[2]), winners: Number(t[3]), title, members: members.map((m, i) => ({ addr: m, st: Number(states[i]) })) };
  }, [id], 6000);
  useTick(!!data && (data.phase === 1 || data.phase === 2));

  if (!valid) return <section className="col"><p className="err">This link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.phase === 0) return <section className="col"><p className="err">Nothing found for this link.</p></section>;

  const me = data.members.find((m) => same(m.addr, acct.address));
  const isJudge = same(acct.address, data.judge);
  const call = (fn, args = [], value) => (wc) => wc.writeContract({ address: ADDR.pledge, abi: pledgeAbi, functionName: fn, args, value });
  const act = async (label, fn, msg) => { const r = await tx.run(label, fn); if (r) { toast(msg); reload(); } };
  const winnersChosen = data.members.filter((m) => picked[m.addr]).map((m) => m.addr);
  const low = acct.balance != null && acct.balance < data.stake;
  const left = data.phase === 1 ? data.joinBy - nowSec() : data.endsAt - nowSec();

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>{data.count > 1 || data.phase === 1 ? 'Pool' : 'Commitment'}</h3><Badge>{PLEDGE_PHASE[data.phase]}</Badge></div>
        <p className="sub" style={{ margin: 0 }}>{data.title}</p>
        <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(data.stake)}<small>MON each</small></div>
        <Row k="People" v={data.count} />
        <Row k="Judge" v={isJudge ? 'You' : shortAddr(data.judge)} />
        <Row k="Ends" v={fmtDate(data.endsAt)} />
        {(data.phase === 1 || data.phase === 2) && left > 0 && <Row k={data.phase === 1 ? 'Joining closes in' : 'Time left'} v={span(left)} />}
        {data.phase === 4 && <Row k="Finished" v={`${data.winners} of ${data.count}`} />}
        <Row k="If nobody finishes" v={shortAddr(data.beneficiary)} />

        {data.members.length > 0 && (
          <div>
            {data.members.map((m) => (
              <label className="pick" key={m.addr}>
                {data.phase === 3 && isJudge && <input type="checkbox" checked={!!picked[m.addr]} onChange={(e) => setPicked({ ...picked, [m.addr]: e.target.checked })} />}
                <span style={{ flex: 1 }}>{same(m.addr, acct.address) ? 'You' : shortAddr(m.addr)}</span>
                {data.phase >= 4 && <span>{m.st >= 2 ? 'Finished' : 'Missed'}</span>}
              </label>
            ))}
          </div>
        )}

        {data.phase === 1 && !me && !isJudge && (
          !acct.authenticated
            ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to join</button>
            : <button className="btn" type="button" onClick={() => act('Joining…', call('join', [id], data.stake), 'You are in')} disabled={!!tx.busy || !acct.address || low}>{tx.busy || `Join with ${formatEther(data.stake)} MON`}</button>
        )}
        {low && data.phase === 1 && !me && <p className="callout warn">You need more MON to join.</p>}
        {data.phase === 3 && isJudge && (
          <>
            <p className="callout">Tick everyone who reached the goal. Anyone you leave unticked loses their stake. You can only do this once.</p>
            <button className="btn" type="button" onClick={() => act('Reporting…', call('resolve', [id, winnersChosen]), 'Result recorded')} disabled={!!tx.busy}>{tx.busy || `Report ${winnersChosen.length} finished`}</button>
          </>
        )}
        {data.phase === 3 && !isJudge && <p className="callout">The end date has passed. The judge is reporting who finished.</p>}
        {data.phase === 4 && me?.st === 2 && <button className="btn" type="button" onClick={() => act('Collecting…', call('withdraw', [id]), 'Collected')} disabled={!!tx.busy}>{tx.busy || 'Collect my money'}</button>}
        {data.phase === 4 && me?.st === 1 && <p className="callout">You did not finish this time, so your stake was not returned.</p>}
        {data.phase === 4 && data.winners === 0 && <button className="btn ghost" type="button" onClick={() => act('Sending…', call('sweep', [id]), 'Sent')} disabled={!!tx.busy}>{tx.busy || 'Send stakes onward'}</button>}
        {data.phase === 5 && me?.st === 1 && (
          <>
            <p className="callout">The judge did not report in time. Everyone gets their own stake back.</p>
            <button className="btn" type="button" onClick={() => act('Collecting…', call('withdraw', [id]), 'Stake returned')} disabled={!!tx.busy}>{tx.busy || 'Take my stake back'}</button>
          </>
        )}
        {data.phase === 1 && <Share url={`${location.origin}/pledge?p=${id}`} text={`Join my pool: ${data.title}.`} toast={toast} />}
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
