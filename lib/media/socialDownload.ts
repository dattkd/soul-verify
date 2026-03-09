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
  console.log(`[socialDownload] yt-dlp: ${chosen} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return { buffer, mimeType: extToMime(ext), filename: chosen };
}

// ─── Cobalt API ──────────────────────────────────────────────────────────────
// Cobalt handles Instagram, TikTok, Twitter/X, YouTube, Reddit and more.
// Requires COBALT_API_KEY. Get one at https://cobalt.tools or host your own.
// Set COBALT_API_URL to override the endpoint (default: https://api.cobalt.tools/).

interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  picker?: Array<{ type: string; url: string; filename?: string }>;
  error?: { code: string };
}

async function tryCobalt(url: string): Promise<DownloadResult | null> {
  const apiKey = process.env.COBALT_API_KEY;
  const cobaltUrl = (process.env.COBALT_API_URL ?? 'https://api.cobalt.tools/').replace(/\/?$/, '/');

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['Api-Key'] = apiKey;

  try {
    const res = await fetch(cobaltUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, downloadMode: 'auto' }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn('[cobalt] HTTP', res.status, await res.text().catch(() => '').then(t => t.slice(0, 100)));
      return null;
    }

    const data = await res.json() as CobaltResponse;

    if (data.status === 'error') {
      console.warn('[cobalt] Error:', data.error?.code);
      return null;
    }

    // Resolve download URL
    let downloadUrl: string | null = null;
    let filename = 'media.mp4';

    if (data.status === 'tunnel' || data.status === 'redirect') {
      downloadUrl = data.url ?? null;
      filename = data.filename ?? filename;
    } else if (data.status === 'picker' && data.picker?.length) {
      // Prefer video items over photos
      const item = data.picker.find(i => i.type === 'video') ?? data.picker[0];
      downloadUrl = item.url;
      filename = item.filename ?? filename;
    }

    if (!downloadUrl) return null;

    // Fetch the actual file from the resolved URL
    const fileRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoulVerify/1.0)' },
      signal: AbortSignal.timeout(90_000),
    });

    if (!fileRes.ok) {
      console.warn('[cobalt] File fetch failed:', fileRes.status);
      return null;
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    if (buffer.length < 1000) {
      console.warn('[cobalt] File too small, likely an error page');
      return null;
    }

    const ct = fileRes.headers.get('content-type') ?? '';
    const mimeType = ct.split(';')[0].trim() || extToMime(path.extname(filename).toLowerCase());

    console.log(`[cobalt] ✓ ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    return { buffer, mimeType, filename };
  } catch (err) {
    console.warn('[cobalt] Error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── yt-dlp fallback ─────────────────────────────────────────────────────────

async function tryYtDlp(url: string): Promise<DownloadResult | null> {
  const ytdlp = await findYtDlp();
  if (!ytdlp) {
    console.warn('[ytdlp] yt-dlp not found');
    return null;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soul_dl_'));
  const outputTemplate = path.join(tmpDir, 'media.%(autonumber)s.%(ext)s');
  const isInstagram = url.includes('instagram.com');

  const baseArgs = [
    '--no-warnings',
    '--ignore-errors',
    '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    '--merge-output-format', 'mp4',
    '-o', outputTemplate,
  ];

  // Instagram-specific: use GQL API extractor + mobile user agent (avoids auth wall)
  const instagramArgs = isInstagram ? [
    '--extractor-arg', 'instagram:api=graphql',
    '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ] : [];

  // Strategies to try in order
  const strategies: string[][] = [
    [...instagramArgs, ...baseArgs, url],
    // Retry without format filter (sometimes needed)
    [...instagramArgs, '--no-warnings', '--ignore-errors', '-o', outputTemplate, url],
  ];

  try {
    for (const args of strategies) {
      try {
        await execFileAsync(ytdlp, args, { timeout: 90_000 });
      } catch {
        // execFile throws even on partial success — check if anything downloaded
      }
      const result = await pickBestFile(tmpDir);
      if (result) return result;
    }

    console.warn('[ytdlp] All strategies failed for', url);
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Download media from any social platform URL.
 * Strategy: Cobalt API first (reliable, handles Instagram/TikTok/Twitter/YouTube),
 * then yt-dlp as fallback.
 *
 * Env vars:
 *   COBALT_API_KEY  — required for api.cobalt.tools (get at cobalt.tools)
 *   COBALT_API_URL  — optional override (default: https://api.cobalt.tools/)
 */
export async function downloadSocialMedia(url: string): Promise<DownloadResult | null> {
  // 1. Try Cobalt — much more reliable for Instagram/TikTok/Twitter
  const cobaltResult = await tryCobalt(url);
  if (cobaltResult) return cobaltResult;

  console.log('[socialDownload] Cobalt failed, trying yt-dlp fallback...');

  // 2. Fall back to yt-dlp
  const ytdlpResult = await tryYtDlp(url);
  if (ytdlpResult) return ytdlpResult;

  console.error('[socialDownload] All download strategies failed for', url);
  return null;
}
