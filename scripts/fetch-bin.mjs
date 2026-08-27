// Build-time fetch of the yt-dlp binary into ./bin.
//
// Runs as the first half of `npm run build` (see package.json), so on every
// Vercel deploy we ship the *latest* yt-dlp — the single most effective hedge
// against extractors going stale as Instagram/TikTok/X change their sites.
// next.config.ts force-includes ./bin in the /api/telegram function bundle.
//
// Platform-aware so a local `npm run build` on macOS/Windows also works. The
// function itself only ever runs on Vercel's Linux, which gets yt-dlp_linux.

import { mkdir, chmod, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const ASSET = {
  linux: 'yt-dlp_linux',
  darwin: 'yt-dlp_macos',
  win32: 'yt-dlp.exe',
}[process.platform];

if (!ASSET) {
  console.error(`fetch-bin: unsupported platform ${process.platform}`);
  process.exit(1);
}

const OUT_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const BIN_DIR = path.join(process.cwd(), 'bin');
const OUT = path.join(BIN_DIR, OUT_NAME);
const URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`;

async function main() {
  await mkdir(BIN_DIR, { recursive: true });

  console.log(`fetch-bin: downloading ${ASSET} -> ${OUT}`);
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);

  await pipeline(Readable.fromWeb(res.body), createWriteStream(OUT));
  if (process.platform !== 'win32') await chmod(OUT, 0o755);

  const { size } = await stat(OUT);
  if (size < 1_000_000) throw new Error(`suspiciously small download (${size} bytes)`);
  console.log(`fetch-bin: ok, ${(size / 1e6).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error('fetch-bin: FAILED —', e.message);
  process.exit(1);
});
