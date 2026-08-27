// Telegram Bot API senders for the media converter. Server-only.
//
// Uploads local files via multipart (the reliable path up to Telegram's 50 MB
// bot limit) rather than passing source URLs, which Telegram caps at ~20 MB and
// often can't fetch from the platforms' CDNs. postMedia() is the single entry
// point the webhook calls; the rest are thin API helpers.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaItem } from './media';

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

// A Telegram media group holds 2–10 items; photos and videos may mix, but
// animations (GIFs) cannot be grouped and are sent on their own.
const GROUP_MAX = 10;

async function asFile(p: string): Promise<File> {
  const buf = await readFile(p);
  return new File([buf], path.basename(p));
}

const replyField = (replyTo?: number): Record<string, string> =>
  replyTo ? { reply_parameters: JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }) } : {};

async function postForm(method: string, fields: Record<string, string>, files: Record<string, File> = {}): Promise<boolean> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const [k, f] of Object.entries(files)) fd.set(k, f, f.name);
  const res = await fetch(API(method), { method: 'POST', body: fd });
  if (res.ok) return true;
  console.warn(`telegram ${method} failed (${res.status}): ${await res.text().catch(() => '')}`);
  return false;
}

async function postJson(method: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return true;
  console.warn(`telegram ${method} failed (${res.status}): ${await res.text().catch(() => '')}`);
  return false;
}

/** A single emoji reaction on a message — our low-noise failure signal. */
export function react(chatId: number, messageId: number, emoji: string): Promise<boolean> {
  return postJson('setMessageReaction', {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: 'emoji', emoji }],
  });
}

export function sendText(chatId: number, text: string, replyTo?: number): Promise<boolean> {
  return postJson('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...replyField(replyTo) });
}

const SINGLE_METHOD = { video: 'sendVideo', photo: 'sendPhoto', animation: 'sendAnimation' } as const;
const SINGLE_FIELD = { video: 'video', photo: 'photo', animation: 'animation' } as const;

async function sendSingle(chatId: number, item: MediaItem, replyTo?: number): Promise<boolean> {
  const extra: Record<string, string> = item.kind === 'video' ? { supports_streaming: 'true' } : {};
  return postForm(
    SINGLE_METHOD[item.kind],
    { chat_id: String(chatId), ...extra, ...replyField(replyTo) },
    { [SINGLE_FIELD[item.kind]]: await asFile(item.path) },
  );
}

async function sendGroup(chatId: number, items: MediaItem[], replyTo?: number): Promise<boolean> {
  const media = items.map((it, i) => ({ type: it.kind === 'video' ? 'video' : 'photo', media: `attach://f${i}` }));
  const files: Record<string, File> = {};
  await Promise.all(items.map(async (it, i) => { files[`f${i}`] = await asFile(it.path); }));
  return postForm('sendMediaGroup', { chat_id: String(chatId), media: JSON.stringify(media), ...replyField(replyTo) }, files);
}

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/**
 * Post the downloaded media back to the chat as a reply. Photos/videos go as a
 * single message or a media group (chunked at 10); GIFs are sent individually.
 * Returns true only if every send succeeded.
 */
export async function postMedia(chatId: number, replyTo: number, items: MediaItem[]): Promise<boolean> {
  if (!items.length) return false;

  const animations = items.filter((i) => i.kind === 'animation');
  const groupable = items.filter((i) => i.kind !== 'animation');

  let ok = true;

  if (groupable.length === 1) {
    ok = (await sendSingle(chatId, groupable[0], replyTo)) && ok;
  } else if (groupable.length >= 2) {
    for (const batch of chunk(groupable, GROUP_MAX)) {
      ok = (await (batch.length === 1 ? sendSingle(chatId, batch[0], replyTo) : sendGroup(chatId, batch, replyTo))) && ok;
    }
  }

  for (const gif of animations) ok = (await sendSingle(chatId, gif, replyTo)) && ok;

  return ok;
}
