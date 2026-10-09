import { claimUrl } from './lib.js';
import { copyText } from './ui.jsx';

export default function Share({ id, kind = 'telegram', handle, amount, toast }) {
  const url = claimUrl(id, kind);
  const text = `@${handle}, you have ${amount} MON waiting on Fabrika. Claim it here:`;
  const out = kind === 'x'
    ? { label: 'Share on X', href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` }
    : { label: 'Send on Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` };
  return (
    <span className="links">
      <button type="button" onClick={() => copyText(url, toast)}>Copy link</button>
      <a href={out.href} target="_blank" rel="noopener">{out.label}</a>
    </span>
  );
}
