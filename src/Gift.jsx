import { useState } from 'react';
import { formatEther, keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ADDR, giftAbi, GIFT_STATUS } from './abis.js';
import { monadTestnet } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr, fmtDate, ADDR_RE } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, bytes, same, dayEnd, todayStr, nowSec } from './kit.jsx';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

const ZERO = '0x0000000000000000000000000000000000000000';

export default function Gift({ acct, toast }) {
  if (!ADDR.gift) return <NotOn name="Programmable gift" />;
  const id = param('g');
  return id ? <View acct={acct} id={id} toast={toast} /> : <Create acct={acct} toast={toast} />;
}

function Create({ acct, toast }) {
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('link');
  const [wallet, setWallet] = useState('');
  const [unlock, setUnlock] = useState('');
  const [approver, setApprover] = useState('');
  const [revocable, setRevocable] = useState(false);
  const [back, setBack] = useState('');
  const [note, setNote] = useState('');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const mine = acct.address ? loadMine('gift', acct.address) : [];

  async function submit() {
    const amount = parseAmount(amt);
    const text = cleanNote(note, 120);
    const unlockAt = unlock ? dayEnd(unlock) : 0;
    const expiresAt = back ? dayEnd(back) : 0;
    if (!amount) return tx.setErr('Enter an amount, for example 5.');
    if (mode === 'wallet' && !ADDR_RE.test(wallet.trim())) return tx.setErr('Enter the wallet address of the person you are gifting.');
    if (approver.trim() && !ADDR_RE.test(approver.trim())) return tx.setErr('The approver must be a wallet address.');
    if (unlock && unlockAt <= nowSec()) return tx.setErr('Pick an unlock date in the future.');
    if (back && (expiresAt <= nowSec() || expiresAt <= unlockAt)) return tx.setErr('Take-back date must be in the future and after the unlock date.');
    if (!unlock && !approver.trim()) return tx.setErr('Add a condition: an unlock date, an approver, or both. Otherwise just send money.');
    if (bytes(text) > 120) return tx.setErr('Keep the note under 120 characters.');

    const id = randomId();
    let key = '';
    let recipient = ZERO, claimKey = ZERO;
    if (mode === 'wallet') recipient = wallet.trim();
    else { key = generatePrivateKey(); claimKey = privateKeyToAccount(key).address; }
    const r = await tx.run('Creating…', (wc) => wc.writeContract({
      address: ADDR.gift, abi: giftAbi, functionName: 'createGift',
      args: [id, recipient, claimKey, approver.trim() || ZERO, BigInt(unlockAt), BigInt(expiresAt), revocable, text],
      value: amount,
    }));
    if (!r) return;
    saveMine('gift', acct.address, { id, title: text || `${formatEther(amount)} MON gift`, key, at: Date.now() });
    setMade({ id, key, amount, text, mode });
  }

  if (made) {
    const url = `${location.origin}/gift?g=${made.id}${made.key ? `#k=${made.key}` : ''}`;
    return (
      <Gate acct={acct} title="Gift">
        <section className="col">
          <div className="card">
            <Done title="Gift locked" line={`${formatEther(made.amount)} MON`} />
            <p className="sub" style={{ margin: 0 }}>
              {made.mode === 'link'
                ? 'Send this link to the person. Whoever holds the link can open the gift once it unlocks, so share it only with them.'
                : 'The recipient is paid automatically when it unlocks. Anyone can trigger the payout from this link.'}
            </p>
            <Share url={url} text={`A gift for you${made.text ? `: ${made.text}` : ''}.`} toast={toast} />
          </div>
          <button className="btn ghost" type="button" onClick={() => { setMade(null); setAmt(''); setNote(''); }}>New gift</button>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Gift">
      <section className="col">
        <div><h1 className="title">Programmable gift</h1><p className="sub">Lock money now. It unlocks on a date, when someone confirms, or both.</p></div>
        <div className="card">
          <div className="field"><label htmlFor="g-amt">Amount (MON)</label><input id="g-amt" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="500" autoComplete="off" /></div>
          <div className="seg" role="tablist" aria-label="Who gets it">
            <button type="button" role="tab" aria-selected={mode === 'link'} onClick={() => setMode('link')}>Gift link</button>
            <button type="button" role="tab" aria-selected={mode === 'wallet'} onClick={() => setMode('wallet')}>Wallet</button>
          </div>
          {mode === 'wallet' && <div className="field"><label htmlFor="g-w">Their wallet address</label><input id="g-w" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" autoComplete="off" /></div>}
          <div className="field"><label htmlFor="g-u">Unlocks on (optional)</label><input id="g-u" type="date" min={todayStr(1)} value={unlock} onChange={(e) => setUnlock(e.target.value)} /></div>
          <div className="field"><label htmlFor="g-a">Someone who must confirm (optional)</label><input id="g-a" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Wallet of a parent, a school, a co-founder" autoComplete="off" /></div>
          <div className="field"><label htmlFor="g-n">Note</label><input id="g-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="When you graduate" maxLength={120} autoComplete="off" /></div>
          <div className="field"><label htmlFor="g-b">Return to me if unclaimed after (optional)</label><input id="g-b" type="date" min={todayStr(1)} value={back} onChange={(e) => setBack(e.target.value)} /></div>
          <label className="check"><input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} />I can take it back before it unlocks</label>
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Lock gift'}</button>
          <Err>{tx.err}</Err>
          <p className="note" style={{ margin: 0 }}>Without a take-back date, a gift nobody claims stays locked for good.</p>
        </div>
        {mine.length > 0 && <div className="card"><h3>Your gifts</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/gift?g=${m.id}${m.key ? `#k=${m.key}` : ''}`}>{m.title}</Link></div>)}</div>}
      </section>
    </Gate>
  );
}

function View({ acct, id, toast }) {
  const tx = useTx(acct);
  const valid = ID_RE.test(id);
  const key = (location.hash.match(/k=(0x[0-9a-fA-F]{64})/) || [])[1] || '';
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const [g, c] = await Promise.all([read(ADDR.gift, giftAbi, 'getGift', [id]), read(ADDR.gift, giftAbi, 'conditionsOf', [id])]);
    return { sender: g[0], recipient: g[1], amount: g[2], unlockAt: Number(g[3]), expiresAt: Number(g[4]), status: Number(g[5]), approver: c[0], approved: c[1], revocable: c[2], bearer: c[3], ready: c[4], note: c[5] };
  }, [id], 6000);

  if (!valid) return <section className="col"><p className="err">This gift link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.status === 0) return <section className="col"><p className="err">No gift found for this link.</p></section>;

  const open = data.status === 1;
  const hasApprover = data.approver !== ZERO;
  const isSender = same(acct.address, data.sender);
  const isApprover = hasApprover && same(acct.address, data.approver);
  const expired = open && data.expiresAt && nowSec() >= data.expiresAt;
  const act = async (label, fn, msg) => { const r = await tx.run(label, fn); if (r) { toast(msg); reload(); } };
  const call = (fn, args = []) => (wc) => wc.writeContract({ address: ADDR.gift, abi: giftAbi, functionName: fn, args });

  async function claim() {
    try {
      const inner = keccak256(encodeAbiParameters(parseAbiParameters('address, uint256, bytes32, address'), [ADDR.gift, BigInt(monadTestnet.id), id, acct.address]));
      const sig = await privateKeyToAccount(key).signMessage({ message: { raw: inner } });
      await act('Opening…', call('claim', [id, sig]), 'Gift received');
    } catch { tx.setErr('This link does not hold a valid key.'); }
  }

  const waiting = [];
  if (data.unlockAt && nowSec() < data.unlockAt) waiting.push(`unlocks ${fmtDate(data.unlockAt)}`);
  if (hasApprover && !data.approved) waiting.push(`${isApprover ? 'waiting for you' : `waiting for ${shortAddr(data.approver)}`} to confirm`);

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>Gift</h3><Badge>{GIFT_STATUS[data.status]}</Badge></div>
        <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(data.amount)}<small>MON</small></div>
        {data.note && <p className="sub" style={{ margin: 0 }}>{data.note}</p>}
        <Row k="From" v={isSender ? 'You' : shortAddr(data.sender)} />
        {!data.bearer && <Row k="For" v={same(acct.address, data.recipient) ? 'You' : shortAddr(data.recipient)} />}
        {data.unlockAt > 0 && <Row k="Unlocks" v={fmtDate(data.unlockAt)} />}
        {hasApprover && <Row k="Confirmed by" v={data.approved ? `${shortAddr(data.approver)} (done)` : shortAddr(data.approver)} />}
        {data.expiresAt > 0 && <Row k="Returns to sender" v={fmtDate(data.expiresAt)} />}
        {open && !expired && !data.ready && <p className="callout">Locked: {waiting.join(' and ') || 'not ready yet'}.</p>}
        {open && !expired && data.ready && <p className="callout">All conditions are met.</p>}

        {open && isApprover && !data.approved && !expired && (
          <button className="btn" type="button" onClick={() => act('Confirming…', call('approve', [id]), 'Confirmed')} disabled={!!tx.busy}>{tx.busy || 'Confirm the condition is met'}</button>
        )}
        {open && !expired && data.ready && !data.bearer && (
          <button className="btn" type="button" onClick={() => act('Releasing…', call('release', [id]), 'Gift released')} disabled={!!tx.busy || !acct.authenticated}>{tx.busy || 'Pay out now'}</button>
        )}
        {open && !expired && data.ready && data.bearer && (
          !acct.authenticated
            ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to open this gift</button>
            : key
              ? <button className="btn" type="button" onClick={claim} disabled={!!tx.busy || !acct.address}>{tx.busy || `Open gift, ${formatEther(data.amount)} MON`}</button>
              : <p className="callout warn">This link is missing its key. Ask the sender for the full link.</p>
        )}
        {expired && <button className="btn" type="button" onClick={() => act('Returning…', call('refund', [id]), 'Returned to sender')} disabled={!!tx.busy}>{tx.busy || 'Return to sender'}</button>}
        {open && isSender && data.revocable && <button className="btn ghost" type="button" onClick={() => act('Cancelling…', call('cancel', [id]), 'Gift cancelled')} disabled={!!tx.busy}>{tx.busy || 'Take it back'}</button>}
        {open && open && !acct.authenticated && !data.bearer && <button className="btn ghost" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
