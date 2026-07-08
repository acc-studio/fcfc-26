// One-shot Telegram wiring check for FCFC '26.
//
//   node --env-file=.env.local scripts/tg-test.mjs
//   node --env-file=.env.local scripts/tg-test.mjs "custom <b>message</b>"
//
// Fires a single harmless message into the group so you can confirm the bot is
// created, added to the chat, and the creds are right — a success here means
// scripts/notify.ts will post in production too, since it reuses this same call
// (POST sendMessage, HTML parse mode, 429 retry). No Firebase, no side effects
// beyond the one message. Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

// Same send helper as notify.ts: retries once on a 429 honouring retry_after,
// logs and returns false on any other failure.
async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (res.ok) return true;
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retry = data?.parameters?.retry_after ?? 1;
    await new Promise((r) => setTimeout(r, (retry + 0.5) * 1000));
    return sendTelegram(text);
  }
  console.error(`telegram send failed (${res.status}): ${await res.text().catch(() => '')}`);
  return false;
}

async function main() {
  if (!TG_TOKEN || !TG_CHAT) {
    console.error('Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — set them in .env.local first.');
    process.exit(1);
  }
  const text = process.argv[2] || '✅ FCFC bot wired up';
  const ok = await sendTelegram(text);
  console.log(ok ? 'sent ok' : 'send failed (see above)');
  process.exit(ok ? 0 : 1);
}

main();
