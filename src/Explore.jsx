import { Link } from './router.jsx';
import { PAY } from './chain.js';
import { ADDR } from './abis.js';

const ITEMS = [
  ['/transfer', 'Send to a name', 'Pay a Telegram or X username or a wallet. Unclaimed money comes back.', true],
  ['/invoice', 'Invoice', 'Ask for an exact amount and get paid.', !!PAY],
  ['/split', 'Split a bill', 'One link. Each person pays their own share. It lands with you.', !!ADDR.split],
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
