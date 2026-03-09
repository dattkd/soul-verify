import type { ExifData } from './exif';
import type { VideoMetadata } from './video';

export interface AiDetectionResult {
  suspicionScore: number; // 0-100
  signals: Array<{ name: string; description: string; weight: number }>;
}

// Common AI image generation output dimensions
const AI_IMAGE_DIMENSIONS: Array<[number, number]> = [
  [1024, 1024], [1344, 768], [768, 1344],
  [1536, 1024], [1024, 1536], [832, 1216],
  [1216, 832],  [2048, 2048], [1280, 720],
  [1920, 1080], [512, 512],   [768, 768],
];

/**
 * Heuristic AI detection for images.
 * Returns a suspicion score 0-100. Does NOT claim certainty.
 */
export function detectAiImage(
  exif: ExifData | null,
  width?: number | null,
  height?: number | null,
  sizeBytes?: number | null,
): AiDetectionResult {
  const signals: AiDetectionResult['signals'] = [];
  let score = 0;

  // No camera make or model — AI images have no camera hardware
  const hasCameraHardware = !!(exif?.make || exif?.model);
  if (!hasCameraHardware) {
    score += 25;
    signals.push({ name: 'no_camera_hardware', description: 'No camera make or model in metadata — AI-generated images lack hardware signatures.', weight: 25 });
  }

  // No original timestamp — camera photos have DateTimeOriginal
  if (!exif?.dateTimeOriginal) {
    score += 10;
    signals.push({ name: 'no_capture_timestamp', description: 'No capture timestamp in EXIF — camera photos typically record this.', weight: 10 });
  }

  // Dimensions match known AI output sizes
  if (width && height) {
    const isAiDimension = AI_IMAGE_DIMENSIONS.some(([w, h]) => w === width && h === height);
    if (isAiDimension) {
      score += 30;
      signals.push({ name: 'ai_dimensions', description: `${width}×${height} matches a common AI image generation output size.`, weight: 30 });
    }
    // Perfect square at power-of-2 size — very common for diffusion models
    if (width === height && (width & (width - 1)) === 0) {
      score += 10;
      signals.push({ name: 'power_of_two_square', description: 'Perfect square with power-of-2 dimensions — typical of diffusion model outputs.', weight: 10 });
    }
  }

  // EXIF present but suspiciously minimal — AI tools sometimes add bare-minimum EXIF
  if (exif && Object.keys(exif).length > 0 && !hasCameraHardware && !exif.dateTimeOriginal) {
    score += 10;
    signals.push({ name: 'minimal_exif', description: 'EXIF present but missing hardware and timestamp fields — pattern seen in AI-generated images.', weight: 10 });
  }

  // Very large file with no camera hardware — AI upscalers produce large clean files
  if (sizeBytes && sizeBytes > 5 * 1024 * 1024 && !hasCameraHardware) {
    score += 10;
    signals.push({ name: 'large_no_hardware', description: 'Large file size with no camera hardware signature.', weight: 10 });
  }

  return { suspicionScore: Math.min(100, score), signals };
}

/**
 * Heuristic AI detection for videos.
 * Returns a suspicion score 0-100.
 */
export function detectAiVideo(
  videoMeta: VideoMetadata | null,
  sizeBytes?: number | null,
): AiDetectionResult {
  const signals: AiDetectionResult['signals'] = [];
  let score = 0;

  if (!videoMeta) return { suspicionScore: 0, signals };

  const { durationMs, width, height, fps, bitrate } = videoMeta;

  // Very short clip with high resolution — AI generation often produces short loops
  if (durationMs > 0 && durationMs <= 6000 && width >= 1024) {
    score += 20;
    signals.push({ name: 'short_hires_clip', description: `${(durationMs / 1000).toFixed(1)}s high-resolution clip — AI video generators commonly produce short loops.`, weight: 20 });
  }

  // Suspiciously "round" duration (exact seconds) — AI generators often produce exact-length clips
  if (durationMs > 0 && durationMs % 1000 === 0) {
    score += 10;
    signals.push({ name: 'exact_duration', description: 'Clip has an exact whole-second duration — common in AI video generation outputs.', weight: 10 });
  }

  // Standard AI generation resolutions
  const AI_VIDEO_DIMENSIONS: Array<[number, number]> = [
    [1024, 576], [576, 1024], [768, 432], [432, 768],
    [1280, 720], [720, 1280], [1024, 1024], [512, 512],
  ];
  if (width && height) {
    if (AI_VIDEO_DIMENSIONS.some(([w, h]) => w === width && h === height)) {
      score += 15;
      signals.push({ name: 'ai_video_dimensions', description: `${width}×${height} matches a common AI video generation output resolution.`, weight: 15 });
    }
  }

  // Very high FPS that doesn't match standard frame rates (AI frame interpolation)
  if (fps && fps > 30 && fps !== 60 && fps !== 120) {
    score += 10;
    signals.push({ name: 'unusual_fps', description: `${fps.toFixed(2)} FPS — non-standard frame rate can indicate AI frame interpolation.`, weight: 10 });
  }

  // Unusually clean bitrate for the resolution (AI renders are often over-compressed for upload)
  if (bitrate && width && height) {
    const pixels = width * height;
    const bitsPerPixelPerSecond = bitrate / pixels;
    if (bitsPerPixelPerSecond < 0.05) {
      score += 10;
      signals.push({ name: 'low_bitrate_ratio', description: 'Low bitrate relative to resolution — common after social platform recompression of AI content.', weight: 10 });
    }
  }

  return { suspicionScore: Math.min(100, score), signals };
}
