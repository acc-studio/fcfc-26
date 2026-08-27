// Pure link detection for the media-converter bot: given a Telegram message,
// return the supported social links found in it (text, caption, and any URLs
// hidden behind text_link entities), classified by platform, de-duplicated and
// capped. No I/O — this is the unit-tested core the webhook builds on.

export type Platform = 'instagram' | 'reddit' | 'tiktok' | 'twitter';

export interface DetectedLink {
  platform: Platform;
  url: string;
}

// A message with more than this many recognized links only has the first few
// converted — a guard against someone pasting a wall of URLs.
export const MAX_LINKS_PER_MESSAGE = 4;

// Only the message fields we read. Kept structural so both the webhook's real
// update objects and test stubs satisfy it.
export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
}
export interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
}

// Matches bare URLs inside free text. Deliberately greedy on the tail; the
// trailing-punctuation trim below cleans up the common `(url).` / `url,` cases.
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

// Characters that commonly abut a URL in prose but are never meant to be part
// of it. Stripped repeatedly from the end.
const TRAILING = /[).,!?;:\]}>"'”’»]+$/;

const stripTrailing = (raw: string): string => {
  let s = raw.trim();
  let prev: string;
  do { prev = s; s = s.replace(TRAILING, ''); } while (s !== prev);
  return s;
};

const bareHost = (u: URL): string => u.hostname.toLowerCase().replace(/^www\./, '');
const hostIs = (host: string, root: string): boolean => host === root || host.endsWith('.' + root);

function classify(u: URL): Platform | null {
  const host = bareHost(u);
  const path = u.pathname;

  if (host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com')) {
    // A media permalink — reel/post/tv, either at root or under a username —
    // or a share link. A bare profile (/username) is not media.
    if (/^\/(reels?|p|tv)\//.test(path) || /^\/[^/]+\/(reels?|p)\//.test(path) || path.startsWith('/share/')) {
      return 'instagram';
    }
    return null;
  }

  // The redd.it / v.redd.it / i.redd.it family always points at a single
  // post or media file — accept unconditionally.
  if (hostIs(host, 'redd.it')) return 'reddit';
  // reddit.com + subdomains (old./np./m.): only a specific post (…/comments/…)
  // or a share link (…/s/…). A bare /r/{sub} listing or /user/{name} profile
  // would make yt-dlp enumerate many posts, so it is not treated as media.
  if (hostIs(host, 'reddit.com')) {
    return /\/comments\//.test(path) || /\/s\/[^/]+/.test(path) ? 'reddit' : null;
  }

  if (hostIs(host, 'tiktok.com')) return 'tiktok';

  if (hostIs(host, 'twitter.com') || hostIs(host, 'x.com')) {
    return /\/status\//.test(path) ? 'twitter' : null;
  }

  return null;
}

// Gather every candidate URL string: bare URLs in the text/caption, plus the
// href of any text_link entity (whose URL never appears as visible text).
function candidates(m: TgMessage): string[] {
  const out: string[] = [];
  for (const body of [m.text, m.caption]) {
    if (body) out.push(...(body.match(URL_RE) ?? []));
  }
  for (const ents of [m.entities, m.caption_entities]) {
    for (const e of ents ?? []) {
      if (e.type === 'text_link' && e.url) out.push(e.url);
    }
  }
  return out;
}

export function extractLinks(m: TgMessage): DetectedLink[] {
  const seen = new Set<string>();
  const links: DetectedLink[] = [];

  for (const raw of candidates(m)) {
    const cleaned = stripTrailing(raw);
    let parsed: URL;
    try { parsed = new URL(cleaned); } catch { continue; }

    const platform = classify(parsed);
    if (!platform) continue;
    if (seen.has(cleaned)) continue;

    seen.add(cleaned);
    links.push({ platform, url: cleaned });
    if (links.length >= MAX_LINKS_PER_MESSAGE) break;
  }

  return links;
}
