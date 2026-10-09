// Usage: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... WEBHOOK_URL=https://your-site.vercel.app/api/telegram node scripts/set-webhook.mjs
const { TELEGRAM_BOT_TOKEN: t, TELEGRAM_WEBHOOK_SECRET: s, WEBHOOK_URL: url } = process.env;
if (!t || !s || !url) { console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and WEBHOOK_URL.'); process.exit(1); }
const res = await fetch(`https://api.telegram.org/bot${t}/setWebhook`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ url, secret_token: s, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
});
console.log(await res.json());
