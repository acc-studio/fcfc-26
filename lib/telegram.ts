// Shared Telegram Bot API helpers, used by both the CI notifier
// (scripts/notify.ts) and the instant Pro-invite route (app/api/pro-invite).
// Server-only — the bot token must never reach the client bundle.

// Escape the three characters Telegram's HTML parse mode cares about. Applied to
// all dynamic copy (team/player names, scores) so a stray & or < can't break a
// message.
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Parse the TELEGRAM_USER_MAP env — { "<FCFC player name>": "<telegram username
// without @>" }. Tolerant of an unset/invalid value (falls back to no mapping,
// so messages still name players, just without a ping).
export const parseUserMap = (raw?: string): Record<string, string> => {
  try { return raw ? JSON.parse(raw) : {}; }
  catch { console.warn('TELEGRAM_USER_MAP is not valid JSON — ignoring.'); return {}; }
};

// A @mention that pings the player if we have a username for them; the plain
// (escaped) name otherwise — still identifies who, just no ping.
export const mentionFor = (name: string | undefined, userMap: Record<string, string>): string => {
  if (!name) return '';
  const u = userMap[name];
  return u ? `@${u.replace(/^@/, '')}` : escapeHtml(name);
};

// Post one HTML message to a chat. Retries once on a 429 (rate limit), honouring
// Telegram's retry_after; any other failure is logged and swallowed (returns
// false) so a send never throws into the caller.
export async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (res.ok) return true;
  if (res.status === 429) {
    const data = await res.json().catch(() => ({} as { parameters?: { retry_after?: number } }));
    const retry = data?.parameters?.retry_after ?? 1;
    await new Promise(r => setTimeout(r, (retry + 0.5) * 1000));
    return sendTelegram(token, chatId, text);
  }
  console.warn(`telegram send failed (${res.status}): ${await res.text().catch(() => '')}`);
  return false;
}
