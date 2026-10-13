// Telegram webhook. Flow:
//  1. Recipient taps "Confirm on Telegram" on the claim page, which opens t.me/<bot>?start=<code>.
//  2. Bot checks the sender's Telegram @username against the on-chain recipient tag.
//  3. Bot shows the destination wallet and asks for a tap. This blocks the "someone sends you their link" trick.
//  4. On confirm, we store { privy user, destination } for that allocation. /api/claim requires a match.
import { formatEther } from 'viem';
import {
  route, HttpError, webhookSecret, safeEqual, tg, kvGet, kvSet, kvDel, readAllocation, tagOf, STATUS_OPEN,
} from './_shared.js';

const CODE_RE = /^[0-9a-f]{32}$/;
const short = (a) => `${a.slice(0, 8)}…${a.slice(-6)}`;

async function say(chatId, text, extra = {}) { await tg('sendMessage', { chat_id: chatId, text, ...extra }); }

// Returns { rec, a } or sends the reason to the chat and returns null.
async function check(chatId, from, code) {
  const rec = CODE_RE.test(code) ? await kvGet(`code:${code}`) : null;
  if (!rec) { await say(chatId, 'This link expired. Go back to the claim page and tap Confirm on Telegram again.'); return null; }
  if (!from?.username) {
    await say(chatId, 'Your Telegram account has no @username. Add one in Settings, then tap the link again.');
    return null;
  }
  const a = await readAllocation(rec.allocationId);
  if (a.status !== STATUS_OPEN) { await say(chatId, 'This payout can no longer be claimed.'); return null; }
  if (tagOf(from.username) !== a.tag) {
    await say(chatId, 'This payout was sent to a different Telegram username than yours, so it cannot be released to you.');
    return null;
  }
  return { rec, a };
}

export default route('POST', async (req) => {
  if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], webhookSecret())) throw new HttpError(401, 'Unauthorized');
  const u = req.body || {};

  try {
    // /start <code>
    const m = u.message;
    if (m?.text && m.chat?.type === 'private') {
      const [cmd, code = ''] = m.text.trim().split(/\s+/);
      if (cmd === '/start' && code) {
        const r = await check(m.chat.id, m.from, code);
        if (r) {
          await say(
            m.chat.id,
            `You have ${formatEther(r.a.amount)} MON waiting.\n\nSend it to this wallet?\n${r.rec.destination}\n\nOnly confirm if you opened this from your own claim page and this is your wallet.`,
            { reply_markup: { inline_keyboard: [[
              { text: `Yes, send to ${short(r.rec.destination)}`, callback_data: `ok:${code}` },
              { text: 'No', callback_data: `no:${code}` },
            ]] } },
          );
        }
      } else if (cmd === '/start') {
        await say(m.chat.id, 'Fabrika pays people on Telegram. If someone sent you a payout, open your claim link and tap Confirm on Telegram.');
      }
    }

    // Button taps
    const cb = u.callback_query;
    if (cb?.data && cb.message) {
      const chatId = cb.message.chat.id;
      const [act, code = ''] = cb.data.split(':');
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
      if (act === 'no') {
        if (CODE_RE.test(code)) await kvDel(`code:${code}`);
        await say(chatId, 'Cancelled. Nothing was sent.');
      } else if (act === 'ok') {
        const r = await check(chatId, cb.from, code);
        if (r) {
          await kvSet(`conf:${r.rec.allocationId}`, { did: r.rec.did, destination: r.rec.destination, tgId: cb.from.id }, 24 * 60 * 60);
          await kvDel(`code:${code}`);
          await say(chatId, 'Confirmed. Go back to the claim page and tap Claim.');
        }
      }
    }
  } catch (e) {
    // Always answer 200 so Telegram does not retry the same update in a loop.
    console.error('telegram handler', e);
  }
  return { ok: true };
});
