// yt-dlp wrapper: turn a social URL into local media files, ready to upload to
// Telegram. Server-only (spawns a child process, writes to the temp dir).
//
// Binaries: the yt-dlp binary is fetched into ./bin at build time
// (scripts/fetch-bin.mjs) and force-included in this function's bundle by
// next.config.ts; ffmpeg comes from the ffmpeg-static package. On Linux (i.e.
// on Vercel) both are copied into the temp dir and chmod +x on first use, so
// they are guaranteed executable regardless of how the bundle preserved modes.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, chmod, readdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { classifyFiles, type MediaItem } from './media';

// Telegram's ceiling for a bot uploading a file via multipart. Downloading
// larger media is pointless — we could not send it — so cap at the source.
const MAX_BYTES = '50M';
// Bound carousels/threads so one link can't fan out into dozens of downloads.
const MAX_ITEMS = 10;
// Hard wall-clock cap on a single yt-dlp run, well inside the function budget.
const RUN_TIMEOUT_MS = 100_000;

export interface DownloadOk {
  ok: true;
  items: MediaItem[];
  dir: string;
}
export interface DownloadFail {
  ok: false;
  reason: 'too-big' | 'unsupported' | 'error';
  detail?: string;
  dir: string;
}
export type DownloadResult = DownloadOk | DownloadFail;

// Resolve the bundled yt-dlp binary: an explicit override, else ./bin next to
// the deployed function.
function ytdlpSource(): string {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(process.cwd(), 'bin', name);
}

// Prepared, guaranteed-executable tool paths — computed once per warm instance.
let toolsPromise: Promise<{ ytdlp: string; ffmpeg: string }> | null = null;
function prepareTools() {
  return (toolsPromise ??= (async () => {
    if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path');
    // Windows (local dev): binaries are already runnable in place.
    if (process.platform === 'win32') {
      return { ytdlp: ytdlpSource(), ffmpeg: ffmpegPath };
    }
    // Linux/macOS: copy into the temp dir and mark executable.
    const binDir = path.join(os.tmpdir(), 'bot-bin');
    await mkdir(binDir, { recursive: true });
    const ytdlp = path.join(binDir, 'yt-dlp');
    const ffmpeg = path.join(binDir, 'ffmpeg');
    await copyFile(ytdlpSource(), ytdlp);
    await copyFile(ffmpegPath, ffmpeg);
    await chmod(ytdlp, 0o755);
    await chmod(ffmpeg, 0o755);
    return { ytdlp, ffmpeg };
  })());
}

// Optional cookie jar (Netscape format) to get past login walls on Instagram/X.
// Written once from the YTDLP_COOKIES env; returns null when unset.
let cookiesPromise: Promise<string | null> | null = null;
function prepareCookies() {
  return (cookiesPromise ??= (async () => {
    const raw = process.env.YTDLP_COOKIES;
    if (!raw) return null;
    const file = path.join(os.tmpdir(), 'bot-cookies.txt');
    await writeFile(file, raw, 'utf8');
    return file;
  })());
}

interface RunResult { code: number | null; stderr: string; }
function run(bin: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdout.on('data', () => {});
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, RUN_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stderr: stderr + '\n' + e.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

const tail = (s: string, n = 400) => s.trim().split('\n').slice(-4).join('\n').slice(-n);

/**
 * Download the media behind `url` into a fresh temp directory. The caller owns
 * the returned `dir` and must `cleanup(dir)` once uploads are done.
 */
export async function download(url: string): Promise<DownloadResult> {
  const { ytdlp, ffmpeg } = await prepareTools();
  const cookies = await prepareCookies();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dl-'));

  const args = [
    url,
    '-o', path.join(dir, '%(autonumber)03d.%(ext)s'),
    '--no-progress', '--no-warnings', '--no-part',
    '--playlist-items', `1-${MAX_ITEMS}`,
    '--max-filesize', MAX_BYTES,
    // Prefer mp4/m4a so the result plays inline in Telegram, but don't *fail*
    // when a platform only offers webm — just take the best available.
    '-S', 'ext:mp4:m4a,res,br',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', ffmpeg,
    '--restrict-filenames',
    '--retries', '3', '--socket-timeout', '20',
    ...(cookies ? ['--cookies', cookies] : []),
  ];

  const { code, stderr } = await run(ytdlp, args);

  const names = await readdir(dir).catch(() => [] as string[]);
  const files = names.sort().map((f) => path.join(dir, f));
  const items = classifyFiles(files);

  if (items.length) return { ok: true, items, dir };

  if (/max.?filesize|larger than.*max|file is larger/i.test(stderr)) {
    return { ok: false, reason: 'too-big', dir };
  }
  if (code !== 0) return { ok: false, reason: 'error', detail: tail(stderr), dir };
  return { ok: false, reason: 'unsupported', dir };
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
