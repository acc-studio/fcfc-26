// Register (or inspect / delete) the Telegram webhook for the converter bot.
//
//   node --env-file=.env.local scripts/set-webhook.mjs https://your-app.vercel.app
//   node --env-file=.env.local scripts/set-webhook.mjs info
//   node --env-file=.env.local scripts/set-webhook.mjs delete
//
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in the environment. The
// secret is sent to Telegram and echoed back in every update's
// X-Telegram-Bot-Api-Secret-Token header, which the route verifies.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token) { console.error('TELEGRAM_BOT_TOKEN is not set'); process.exit(1); }

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;
const call = async (method, body) => {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
};

const arg = process.argv[2];

async function main() {
  if (arg === 'info') {
    console.log(JSON.stringify(await call('getWebhookInfo'), null, 2));
    return;
  }
  if (arg === 'delete') {
    console.log(JSON.stringify(await call('deleteWebhook', { drop_pending_updates: true }), null, 2));
    return;
  }
  if (!arg) { console.error('usage: set-webhook.mjs <base-url|info|delete>'); process.exit(1); }
  if (!secret) { console.error('TELEGRAM_WEBHOOK_SECRET is not set'); process.exit(1); }

  const url = arg.replace(/\/+$/, '') + '/api/telegram';
  const result = await call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
    max_connections: 20,
  });
  console.log('setWebhook ->', JSON.stringify(result));
  console.log('getWebhookInfo ->', JSON.stringify(await call('getWebhookInfo'), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
