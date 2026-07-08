// Prints the chat id(s) the bot can currently see, to fill TELEGRAM_CHAT_ID.
//
//   node --env-file=.env.local scripts/tg-chat-id.mjs
//
// Prereq: bot created (@BotFather), added to the FCFC group, and at least one
// message posted in the group AFTER it joined (Telegram only surfaces chats via
// getUpdates once there's a recent update). Reads TELEGRAM_BOT_TOKEN from env.

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function main() {
  if (!TG_TOKEN) {
    console.error('Missing TELEGRAM_BOT_TOKEN — set it in .env.local first.');
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates`);
  if (!res.ok) {
    console.error(`getUpdates failed (${res.status}): ${await res.text().catch(() => '')}`);
    process.exit(1);
  }
  const { result = [] } = await res.json();
  const chats = new Map();
  for (const u of result) {
    const chat = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
    if (chat) chats.set(chat.id, chat.title || chat.username || chat.type);
  }
  if (!chats.size) {
    console.log('No chats seen yet. Post a message in the group (after adding the bot) and re-run.');
    process.exit(0);
  }
  for (const [id, name] of chats) console.log(`${id}\t${name}`);
}

main();
