import { claimUrl } from './lib.js';
import { copyText } from './ui.jsx';

export default function Share({ id, handle, amount, toast }) {
  const url = claimUrl(id);
  const text = `@${handle}, you have ${amount} MON waiting on Fabrika. Claim it here:`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return (
    <span className="links">
      <button type="button" onClick={() => copyText(url, toast)}>Copy link</button>
      <a href={tg} target="_blank" rel="noopener">Send on Telegram</a>
    </span>
  );
}
