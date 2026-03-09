/**
 * Sightengine AI-generated video detection.
 * Submits the actual video file (not extracted frames) — preserves all
 * temporal and compression artifacts that frame-level detectors miss.
 *
 * Free tier: 2,000 operations/month, no credit card required.
 * Docs: https://sightengine.com/docs/ai-generated-video-detection
 */

const SYNC_ENDPOINT = 'https://api.sightengine.com/1.0/video/check-sync.json';

export interface SightengineResult {
  aiProbability: number;   // 0-100, max score across all frames
  frameScores: number[];   // per-frame scores (0-100)
  avgProbability: number;  // average across frames
}

function getCredentials(): { apiUser: string; apiSecret: string } | null {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;
  if (!apiUser || !apiSecret) return null;
  return { apiUser, apiSecret };
}

/**
 * Detect AI-generated content in a video by submitting the raw video buffer.
 * Uses Sightengine's sync endpoint — suited for videos under ~60s.
 * Returns null if credentials not set or on any error.
 */
export async function detectVideoWithSightengine(
  buffer: Buffer,
  filename: string,
): Promise<SightengineResult | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const form = new FormData();

  // Append video as a Blob with correct MIME type
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'mp4';
  const mimeType = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  form.append('media', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append('models', 'genai');
  form.append('interval', '1'); // sample every 1 second
  form.append('api_user', creds.apiUser);
  form.append('api_secret', creds.apiSecret);

  try {
    const res = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(120_000), // 2 min for longer videos
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[sightengine] API error:', res.status, body);
      return null;
    }

    const json = await res.json() as {
      status?: string;
      data?: {
        frames?: Array<{
          type?: { ai_generated?: number };
          info?: { position?: number };
        }>;
      };
    };

    if (json.status !== 'success' || !json.data?.frames?.length) {
      console.warn('[sightengine] Unexpected response:', JSON.stringify(json).slice(0, 200));
      return null;
    }

    const frameScores = json.data.frames
      .map(f => Math.round((f.type?.ai_generated ?? 0) * 100))
      .filter(s => s > 0 || true); // keep all, including zeros

    if (frameScores.length === 0) return null;

    const maxScore = Math.max(...frameScores);
    const avgScore = Math.round(frameScores.reduce((a, b) => a + b, 0) / frameScores.length);

    console.log(`[sightengine] ${frameScores.length} frames analyzed → max: ${maxScore}% | avg: ${avgScore}%`);

    return { aiProbability: maxScore, frameScores, avgProbability: avgScore };
  } catch (err) {
    console.warn('[sightengine] Request error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Detect AI-generated content in an image using Sightengine's image endpoint.
 * Used as a secondary check alongside Hive.
 */
export async function detectImageWithSightengine(
  buffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const form = new FormData();
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  form.append('media', new Blob([new Uint8Array(buffer)], { type: mimeType }), `image.${ext}`);
  form.append('models', 'genai');
  form.append('api_user', creds.apiUser);
  form.append('api_secret', creds.apiSecret);

  try {
    const res = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    const json = await res.json() as {
      status?: string;
      type?: { ai_generated?: number };
    };

    if (json.status !== 'success' || typeof json.type?.ai_generated !== 'number') return null;

    const score = Math.round(json.type.ai_generated * 100);
    console.log(`[sightengine] Image: ${score}% AI`);
    return score;
  } catch {
    return null;
  }
}
