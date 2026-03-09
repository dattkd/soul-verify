import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const execFileAsync = promisify(execFile);

// Support Homebrew on both Intel (/usr/local) and Apple Silicon (/opt/homebrew)
const FFMPEG_PATHS = ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg'];
const FFPROBE_PATHS = ['/usr/local/bin/ffprobe', '/opt/homebrew/bin/ffprobe', 'ffprobe'];

async function findBin(candidates: string[]): Promise<string> {
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch { /* try next */ }
  }
  return candidates[candidates.length - 1]; // fall back to bare name
}

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  codec: string;
  bitrate?: number;
  fps?: number;
  format?: string;
}

export async function extractVideoMetadata(inputPath: string): Promise<VideoMetadata | null> {
  try {
    const ffprobe = await findBin(FFPROBE_PATHS);
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      inputPath,
    ]);
    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
    if (!videoStream) return null;
    const durationMs = Math.round(parseFloat(data.format?.duration ?? '0') * 1000);
    const [fpsNum, fpsDen] = (videoStream.r_frame_rate ?? '0/1').split('/').map(Number);
    const fps = fpsDen > 0 ? fpsNum / fpsDen : undefined;
    return {
      durationMs,
      width: videoStream.width ?? 0,
      height: videoStream.height ?? 0,
      codec: videoStream.codec_name ?? 'unknown',
      bitrate: data.format?.bit_rate ? parseInt(data.format.bit_rate) : undefined,
      fps,
      format: data.format?.format_name,
    };
  } catch {
    return null;
  }
}

export async function extractFrames(inputPath: string, outputDir: string, count = 5): Promise<string[]> {
  try {
    const ffmpeg = await findBin(FFMPEG_PATHS);
    await fs.mkdir(outputDir, { recursive: true });
    await execFileAsync(ffmpeg, [
      '-i', inputPath,
      '-vframes', String(count),
      '-q:v', '2',
      path.join(outputDir, 'frame_%03d.jpg'),
      '-y',
    ]);
    const files = await fs.readdir(outputDir);
    return files
      .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort()
      .map(f => path.join(outputDir, f));
  } catch {
    return [];
  }
}

export async function extractFramesFromBuffer(buffer: Buffer, count = 5): Promise<Buffer[]> {
  const tmpDir = os.tmpdir();
  const inputFile = path.join(tmpDir, `soul_input_${Date.now()}.tmp`);
  const outputDir = path.join(tmpDir, `soul_frames_${Date.now()}`);
  try {
    await fs.writeFile(inputFile, buffer);
    const framePaths = await extractFrames(inputFile, outputDir, count);
    return Promise.all(framePaths.map(p => fs.readFile(p)));
  } finally {
    await fs.rm(inputFile, { force: true });
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}
