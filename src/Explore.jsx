import { Link } from './router.jsx';
import { PAY } from './chain.js';
import { ADDR } from './abis.js';

const ITEMS = [
  ['/transfer', 'Send to a name', 'Pay a Telegram or X username or a wallet. Unclaimed money comes back.', true],
  ['/tip', 'Tip', 'A tip link for a creator, or tip one in a tap.', true],
  ['/split', 'Split a bill', 'One link. Each person pays their own share. It lands with you.', !!ADDR.split],
  ['/invoice', 'Invoice', 'Ask for an exact amount and get paid.', !!PAY],
  ['/gift', 'Programmable gift', 'Money that unlocks on a date or when someone confirms. Share it as a link.', !!ADDR.gift],
  ['/pledge', 'Commitments and pools', 'Put money behind a goal. Alone, or with a group where finishers split the stakes of those who quit.', !!ADDR.pledge],
  ['/isa', 'Income share', 'Back a friend. Get a share of their future income, up to a cap.', !!ADDR.isa],
  ['/stream', 'Salary stream', 'Get paid every second. Withdraw whenever you want.', !!ADDR.stream],
  ['/cover', 'Cover by the minute', 'Insure a laptop or a trip for a few hours. Or earn premiums as an underwriter.', !!ADDR.cover],
  ['/save', 'Goal savings', 'Your rate goes up when your friends confirm your goal.', !!ADDR.savings],
];

export default function Explore() {
  return (
    <section className="col" style={{ maxWidth: 760 }}>
      <div>
        <h1 className="title">Explore</h1>
        <p className="sub">Everything you can do with Fabrika.</p>
      </div>
      <div className="tiles">
        {ITEMS.map(([to, name, text, on]) => (
          <Link key={to} className="tile" to={to}>
            <b>{name}</b>
            <span>{text}</span>
            {!on && <em>Not switched on yet</em>}
          </Link>
        ))}
      </div>
    </section>
  );
}
