import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

const YTDLP_PATHS = [
  '/usr/local/bin/yt-dlp',
  '/opt/homebrew/bin/yt-dlp',
  '/usr/bin/yt-dlp',
];


async function findYtDlp(): Promise<string | null> {
  for (const p of YTDLP_PATHS) {
    try { await fs.access(p); return p; } catch { /* try next */ }
  }
  return null;
}

export interface DownloadResult {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function extToMime(ext: string): string {
  if (ext === '.mp4' || ext === '.mov') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function pickBestFile(tmpDir: string): Promise<DownloadResult | null> {
  const files = await fs.readdir(tmpDir).catch(() => [] as string[]);
  if (files.length === 0) return null;

  // Prefer videos, then images, then anything; pick largest of each type
  const videos = files.filter(f => VIDEO_EXTS.has(path.extname(f).toLowerCase()));
  const images = files.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  const candidates = videos.length > 0 ? videos : images.length > 0 ? images : files;

  let chosen = candidates[0];
  let chosenSize = 0;
  for (const f of candidates) {
    const stat = await fs.stat(path.join(tmpDir, f)).catch(() => ({ size: 0 }));
    if (stat.size > chosenSize) { chosen = f; chosenSize = stat.size; }
  }

  const filePath = path.join(tmpDir, chosen);
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(chosen).toLowerCase();
  console.log(`[socialDownload] Using ${chosen} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return { buffer, mimeType: extToMime(ext), filename: chosen };
}

async function attemptDownload(
  ytdlp: string,
  url: string,
  outputTemplate: string,
  cookieArgs: string[],
): Promise<DownloadResult | null> {
  const tmpDir = path.dirname(outputTemplate);
  try {
    await execFileAsync(ytdlp, [
      ...cookieArgs,
      '--ignore-errors',            // keep going past individual item failures
      '--no-warnings',
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      url,
    ], { timeout: 120_000 });
  } catch {
    // execFile throws even on partial success — check if anything downloaded
  }
  return pickBestFile(tmpDir);
}

/**
 * Download media from a social platform URL using yt-dlp.
 * - Tries Chrome → Safari → Firefox → unauthenticated
 * - Downloads all items in a carousel (not just first) to catch videos in mixed posts
 * - Returns null for photo-only posts (yt-dlp cannot download Instagram photos)
 */
export async function downloadSocialMedia(url: string): Promise<DownloadResult | null> {
  const ytdlp = await findYtDlp();
  if (!ytdlp) {
    console.warn('[socialDownload] yt-dlp not found');
    return null;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soul_dl_'));
  const outputTemplate = path.join(tmpDir, 'media.%(autonumber)s.%(ext)s');

  try {
    // Unauthenticated only — public videos/reels work without cookies.
    // Browser cookie extraction is deliberately omitted to avoid macOS Keychain prompts.
    const result = await attemptDownload(ytdlp, url, outputTemplate, []);
    if (result) return result;

    console.error('[socialDownload] Download failed for', url);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
