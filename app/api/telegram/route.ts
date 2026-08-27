// Telegram webhook for the media-converter bot.
//
// Telegram POSTs every group message here (privacy mode is disabled on the
// bot). We detect supported links, and — after acking fast so Telegram never
// times out and retries — download each one with yt-dlp and re-post it as
// native media, replied to the original. Failures surface as a single reaction
// (falling back to a terse reply if the group blocks bot reactions).

import { after } from 'next/server';
import { extractLinks, type TgMessage } from '@/lib/bot/links';
import { download, cleanup } from '@/lib/bot/ytdlp';
import { postMedia, react, sendText } from '@/lib/bot/telegram-media';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Reaction emojis must come from Telegram's allowed set (⚠️ is not in it).
const REACT_TOO_BIG = '🐳';
const REACT_FAILED = '🤷';

// In-memory de-dupe of update_ids. We ack 200 unconditionally so Telegram won't
// retry, but a rare double-delivery to two warm instances is still cheap to
// guard against. Bounded so it can't grow without limit.
const seen = new Set<number>();
const remember = (id: number): boolean => {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 1000) seen.clear();
  return true;
};

// Optional allowlist: restrict the bot to specific chats (e.g. the FCFC group).
// Empty/unset ⇒ act in any chat it's added to (the webhook secret still gates
// who can call the endpoint at all).
function chatAllowed(chatId: number): boolean {
  const raw = process.env.TG_ALLOWED_CHAT_IDS?.trim();
  if (!raw) return true;
  return raw.split(',').map((s) => s.trim()).includes(String(chatId));
}

async function signalFailure(chatId: number, messageId: number, emoji: string, text: string): Promise<void> {
  const reacted = await react(chatId, messageId, emoji);
  if (!reacted) await sendText(chatId, text, messageId);
}

async function convertOne(chatId: number, messageId: number, url: string): Promise<void> {
  const res = await download(url);
  try {
    if (res.ok) {
      const posted = await postMedia(chatId, messageId, res.items);
      if (!posted) await signalFailure(chatId, messageId, REACT_FAILED, "Couldn't send that one.");
    } else if (res.reason === 'too-big') {
      await signalFailure(chatId, messageId, REACT_TOO_BIG, 'That video is over 50 MB — too big for me to re-upload.');
    } else {
      await signalFailure(chatId, messageId, REACT_FAILED, "Couldn't fetch media from that link.");
    }
  } finally {
    await cleanup(res.dir);
  }
}

async function handleMessage(message: TgMessage): Promise<void> {
  const links = extractLinks(message);
  for (const { url } of links) {
    try {
      await convertOne(message.chat.id, message.message_id, url);
    } catch (e) {
      console.error(`convert failed for ${url}:`, e);
    }
  }
}

interface Update {
  update_id: number;
  message?: TgMessage & { from?: { is_bot?: boolean } };
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  let update: Update;
  try {
    update = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const message = update.message;
  const isActionable =
    typeof update.update_id === 'number' &&
    remember(update.update_id) &&
    message &&
    !message.from?.is_bot &&
    chatAllowed(message.chat.id) &&
    extractLinks(message).length > 0;

  // Always ack fast; do the heavy lifting after the response is sent.
  if (isActionable) after(handleMessage(message));

  return new Response('ok');
}

// Lightweight health check for manual verification (Telegram only ever POSTs).
export function GET(): Response {
  return Response.json({ ok: true, bot: 'media-converter' });
}
