/**
 * AI or Not — purpose-built AI content detection API.
 * Trained specifically on AI vs real images/videos across all major generators.
 *
 * Image endpoint: POST https://api.aiornot.com/v2/image/sync
 * Video endpoint: POST https://api.aiornot.com/v2/video/sync
 * Docs: https://docs.aiornot.com
 *
 * Env: AIORNOT_API_KEY
 */

const IMAGE_ENDPOINT = 'https://api.aiornot.com/v2/image/sync';
const VIDEO_ENDPOINT = 'https://api.aiornot.com/v2/video/sync';

// Human-readable generator names for display
const GENERATOR_LABELS: Record<string, string> = {
  midjourney: 'Midjourney',
  dall_e: 'DALL·E',
  stable_diffusion: 'Stable Diffusion',
  this_person_does_not_exist: 'StyleGAN / TPDNE',
  adobe_firefly: 'Adobe Firefly',
  flux: 'Flux',
  four_o: 'GPT-4o',
};

export interface AiOrNotImageResult {
  aiProbability: number;        // 0–100
  isDeepfake: boolean;
  detectedGenerator: string | null;   // human-readable name e.g. "Midjourney"
  generatorConfidence: number;  // 0–100
}

export interface AiOrNotVideoResult {
  aiVideoProbability: number;  // 0–100
  aiVoiceProbability: number;  // 0–100
  isDeepfake: boolean;
  deepfakeConfidence: number;  // 0–100
}

function getApiKey(): string | null {
  return process.env.AIORNOT_API_KEY ?? null;
}

/**
 * Detect AI-generated content in an image using AI or Not's trained model.
 * Also detects deepfakes and identifies the specific AI generator used.
 */
export async function detectImageWithAiOrNot(
  buffer: Buffer,
  mimeType: string,
): Promise<AiOrNotImageResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ext = mimeType.includes('png') ? 'png'
    : mimeType.includes('webp') ? 'webp'
    : mimeType.includes('gif') ? 'gif'
    : 'jpg';

  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)], { type: mimeType }), `image.${ext}`);

  try {
    const res = await fetch(`${IMAGE_ENDPOINT}?only=ai_generated&only=deepfake`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[aiornot] Image API error:', res.status, body.slice(0, 200));
      return null;
    }

    const json = await res.json() as {
      report?: {
        ai_generated?: {
          ai?: { confidence?: number };
          generator?: Record<string, { is_detected?: boolean; confidence?: number }>;
        };
        deepfake?: { is_detected?: boolean };
      };
    };

    const aiConf = json.report?.ai_generated?.ai?.confidence ?? 0;
    const aiProbability = Math.round(aiConf * 100);

    // Find highest-confidence generator attribution
    const generators = json.report?.ai_generated?.generator ?? {};
    let topGeneratorKey: string | null = null;
    let topConf = 0;
    for (const [key, data] of Object.entries(generators)) {
      if ((data.confidence ?? 0) > topConf) {
        topConf = data.confidence ?? 0;
        topGeneratorKey = key;
      }
    }
    const detectedGenerator = topGeneratorKey
      ? (GENERATOR_LABELS[topGeneratorKey] ?? topGeneratorKey)
      : null;
    const generatorConfidence = Math.round(topConf * 100);

    const isDeepfake = json.report?.deepfake?.is_detected ?? false;

    console.log(`[aiornot] Image: ${aiProbability}% AI${detectedGenerator ? ` (${detectedGenerator} ${generatorConfidence}%)` : ''}${isDeepfake ? ' | DEEPFAKE DETECTED' : ''}`);

    return { aiProbability, isDeepfake, detectedGenerator, generatorConfidence };
  } catch (err) {
    console.warn('[aiornot] Image error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Detect AI-generated content in a video using AI or Not's trained model.
 * Separately scores AI video generation, AI voice, and deepfake face manipulation.
 */
export async function detectVideoWithAiOrNot(
  buffer: Buffer,
  filename: string,
): Promise<AiOrNotVideoResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ext = filename.split('.').pop()?.toLowerCase() ?? 'mp4';
  const mimeType = ext === 'webm' ? 'video/webm'
    : ext === 'mov' ? 'video/quicktime'
    : 'video/mp4';

  const form = new FormData();
  form.append('video', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  try {
    const res = await fetch(`${VIDEO_ENDPOINT}?only=ai_video&only=ai_voice&only=deepfake_video`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[aiornot] Video API error:', res.status, body.slice(0, 200));
      return null;
    }

    const json = await res.json() as {
      report?: {
        ai_video?: { confidence?: number };
        ai_voice?: { confidence?: number };
        deepfake_video?: { is_detected?: boolean; confidence?: number };
      };
    };

    const aiVideoProbability = Math.round((json.report?.ai_video?.confidence ?? 0) * 100);
    const aiVoiceProbability = Math.round((json.report?.ai_voice?.confidence ?? 0) * 100);
    const isDeepfake = json.report?.deepfake_video?.is_detected ?? false;
    const deepfakeConfidence = Math.round((json.report?.deepfake_video?.confidence ?? 0) * 100);

    console.log(`[aiornot] Video: ${aiVideoProbability}% AI | voice: ${aiVoiceProbability}%${isDeepfake ? ` | DEEPFAKE ${deepfakeConfidence}%` : ''}`);

    return { aiVideoProbability, aiVoiceProbability, isDeepfake, deepfakeConfidence };
  } catch (err) {
    console.warn('[aiornot] Video error:', err instanceof Error ? err.message : err);
    return null;
  }
}
