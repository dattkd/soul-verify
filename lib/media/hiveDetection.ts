/**
 * Hive AI-generated content detection via NVIDIA NIM.
 * Specialized model trained specifically on AI-generated vs real images.
 * Returns a score (0–100) and which AI tool likely generated it.
 *
 * Endpoint: https://ai.api.nvidia.com/v1/cv/hive/ai-generated-image-detection
 * Docs: https://build.nvidia.com/hive/ai-generated-image-detection
 */

const HIVE_ENDPOINT = 'https://ai.api.nvidia.com/v1/cv/hive/ai-generated-image-detection';
const MAX_INLINE_BYTES = 180_000; // NVIDIA recommends upload for images >200KB

export interface HiveDetectionResult {
  aiProbability: number;      // 0-100
  topSource: string | null;   // e.g. "stablediffusionxl", "flux", "sora"
  allSources: Record<string, number>;
}

function getApiKey(): string | null {
  return process.env.NVIDIA_API_KEY ?? null;
}

async function detectSingleFrame(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<number | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  // For large images, resize down first to stay under inline limit
  let buf = imageBuffer;
  if (buf.length > MAX_INLINE_BYTES) {
    try {
      const sharp = (await import('sharp')).default;
      buf = await sharp(buf).resize(1280, 1280, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    } catch {
      // sharp unavailable — send as-is and hope it's under the limit
    }
  }

  const b64 = buf.toString('base64');
  const dataUri = `data:${mimeType};base64,${b64}`;

  try {
    const res = await fetch(HIVE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ input: [dataUri] }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn('[hive] API error:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const json = await res.json() as {
      data?: Array<{ is_ai_generated?: number; status?: string }>;
    };

    const item = json.data?.[0];
    if (!item || item.status !== 'SUCCESS') return null;

    const prob = item.is_ai_generated;
    if (typeof prob !== 'number') return null;

    return Math.round(prob * 100); // 0.9994 → 99
  } catch (err) {
    console.warn('[hive] Request error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function detectSingleFrameWithSources(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<HiveDetectionResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  let buf = imageBuffer;
  if (buf.length > MAX_INLINE_BYTES) {
    try {
      const sharp = (await import('sharp')).default;
      buf = await sharp(buf).resize(1280, 1280, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    } catch { /* send as-is */ }
  }

  const b64 = buf.toString('base64');
  const dataUri = `data:${mimeType};base64,${b64}`;

  try {
    const res = await fetch(HIVE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ input: [dataUri] }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn('[hive] API error:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const json = await res.json() as {
      data?: Array<{
        is_ai_generated?: number;
        possible_sources?: Record<string, number>;
        status?: string;
      }>;
    };

    const item = json.data?.[0];
    if (!item || item.status !== 'SUCCESS' || typeof item.is_ai_generated !== 'number') return null;

    const sources = item.possible_sources ?? {};
    // Find the top attributed source (excluding "none")
    const topSource = Object.entries(sources)
      .filter(([k]) => k !== 'none')
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    return {
      aiProbability: Math.round(item.is_ai_generated * 100),
      topSource,
      allSources: sources,
    };
  } catch (err) {
    console.warn('[hive] Request error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Run Hive detection on a single image buffer.
 */
export async function detectImageWithHive(
  buffer: Buffer,
  mimeType: string,
): Promise<HiveDetectionResult | null> {
  if (!getApiKey()) return null;
  const mt = mimeType.startsWith('image/png') ? 'image/png'
    : mimeType.startsWith('image/webp') ? 'image/webp'
    : 'image/jpeg';
  const result = await detectSingleFrameWithSources(buffer, mt);
  if (result) {
    console.log(`[hive] Image: ${result.aiProbability}% AI${result.topSource ? ` (${result.topSource})` : ''}`);
  }
  return result;
}

/**
 * Run Hive detection across all extracted video frames.
 * Takes the maximum score across frames (worst-case = most AI-like frame wins).
 * Also aggregates source attributions.
 */
export async function detectVideoFramesWithHive(
  frames: Buffer[],
): Promise<HiveDetectionResult | null> {
  if (!getApiKey() || frames.length === 0) return null;

  // Run all frames in parallel — Hive is fast (~1–2s per frame)
  const results = await Promise.all(
    frames.map(f => detectSingleFrame(f, 'image/jpeg')),
  );

  const valid = results.filter((r): r is number => r !== null);
  if (valid.length === 0) return null;

  // Use the MAXIMUM score — the most AI-like frame drives the verdict
  const maxScore = Math.max(...valid);
  console.log(`[hive] Video frames: [${valid.join(', ')}] → max ${maxScore}%`);

  // Get full source attribution from the highest-scoring frame
  const highestIdx = results.indexOf(maxScore);
  const detailed = await detectSingleFrameWithSources(frames[highestIdx], 'image/jpeg');

  return {
    aiProbability: maxScore,
    topSource: detailed?.topSource ?? null,
    allSources: detailed?.allSources ?? {},
  };
}
