// Pure mapping from downloaded file paths to the Telegram media kind used to
// send each one. yt-dlp gives us files; this decides sendVideo vs sendPhoto vs
// sendAnimation (and drops sidecar files like .json/.txt thumbnails).

import path from 'node:path';

export type MediaKind = 'video' | 'photo' | 'animation';

export interface MediaItem {
  path: string;
  kind: MediaKind;
}

const BY_EXT: Record<string, MediaKind> = {
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.webm': 'video', '.m4v': 'video',
  '.jpg': 'photo', '.jpeg': 'photo', '.png': 'photo', '.webp': 'photo', '.heic': 'photo',
  '.gif': 'animation',
};

export function classifyFiles(paths: string[]): MediaItem[] {
  const items: MediaItem[] = [];
  for (const p of paths) {
    const kind = BY_EXT[path.extname(p).toLowerCase()];
    if (kind) items.push({ path: p, kind });
  }
  return items;
}
