import Anthropic from '@anthropic-ai/sdk';

export interface VisionAnalysisResult {
  aiProbability: number; // 0-100
  signals: string[];
  reasoning: string;
}

const VISION_MODEL = 'claude-haiku-4-5-20251001';

const IMAGE_ANALYSIS_PROMPT = `You are a forensic digital media expert specialising in detecting AI-generated images. Be accurate — both false positives (calling real content AI) and false negatives (missing AI content) are harmful.

Examine this image carefully for AI generation artifacts from systems like Stable Diffusion, Midjourney, DALL-E, Firefly, Flux, or similar.

Signals to look for:
- Skin & faces: waxy/plastic texture, over-smoothed pores, floating ears, teeth that are clearly AI-distorted
- Hands & fingers: extra, missing, or melted fingers — a classic AI failure mode
- Background: repetitive textures, edges that bleed into subjects, geometry that doesn't add up
- Lighting: light sources that don't match shadows, impossible reflections
- Text: garbled letters, words that half-exist, inconsistent font weights within the same sign
- Camera authenticity: absence of any lens distortion or natural sensor noise throughout the whole image
- Style inconsistency: parts of the image that look like different rendering styles

Respond ONLY with valid JSON — no markdown, no code fences:
{
  "aiGeneratedProbability": <integer 0-100>,
  "signals": [<array of specific observations, max 6>],
  "reasoning": "<2-3 sentence forensic conclusion>"
}

Calibration:
- 0-30: strong evidence of a real photograph (natural imperfections, organic composition, sensor noise)
- 31-50: probably real but minor ambiguous features present
- 51-74: ambiguous — some AI-like signals but not conclusive
- 75-100: clear generative artifacts present — likely AI-generated`;

/**
 * Build the video analysis prompt dynamically based on what frames we're sending.
 * frameCount = regular frames, diffCount = temporal difference frames.
 */
function buildVideoPrompt(frameCount: number, diffCount: number): string {
  const hasDiffs = diffCount > 0;

  return `You are a forensic digital media expert specialising in detecting AI-generated video.

You are examining ${frameCount} regular video frames${hasDiffs ? ` AND ${diffCount} TEMPORAL DIFFERENCE frames` : ''}.
${hasDiffs ? `
TEMPORAL DIFFERENCE FRAMES (sent after the regular frames): These show pixel-level changes between consecutive frames, amplified 8× for visibility.
- REAL video: sensor noise creates scattered, organic-looking dots in static areas (walls, floors, background). Motion areas show natural blur edges.
- AI video: static areas often have ZERO noise (completely black in diff = unnaturally perfect) OR structured/patterned noise (gradients, repeating patterns). Motion boundaries are too sharp or too smooth.
Scrutinise the diff frames extremely carefully — this is the most reliable forensic signal.
` : ''}
WHAT TO LOOK FOR across all regular frames:

SUBJECT/ENVIRONMENT INTEGRATION:
- Do humans look naturally embedded in the scene or slightly "pasted on"?
- Does clothing move realistically or does it swim/warp between frames?
- Hair: natural hair has complex strand movement — AI hair often flickers, looks plasticised, or streams unnaturally

ENVIRONMENTAL SURFACES:
- Concrete, metal, fabric: AI produces over-smooth or repetitively-patterned textures
- Floor/wall continuity — does the surface texture stay consistent or subtly shift?

MOTION PHYSICS:
- Falling, running, collapsing bodies: does the weight distribution and acceleration look physically correct?
- Small objects (debris, fabric edges): real motion has micro-details; AI motion is often too smooth or has "swimming" artefacts

CAMERA BEHAVIOUR:
- Real phone footage: organic, slightly imperfect shake, authentic motion blur
- AI "found footage": can look too stable OR has artificial shake that doesn't correlate with the scene

IMPORTANT — HIGH-QUALITY AI CONTENT:
Modern AI video generators (Sora, Runway Gen-3, Kling 2.0) are specifically trained to produce content that looks like authentic phone/security footage. Focus on:
1. The temporal difference frames (static region noise patterns)
2. Fine surface texture consistency across ALL frames
3. Whether human motion follows realistic biomechanics

When uncertain, score in the 51-74 range — do not assume AI without clear evidence.

Respond ONLY with valid JSON — no markdown, no code fences:
{
  "aiGeneratedProbability": <integer 0-100>,
  "signals": [<array of specific observations, max 6>],
  "reasoning": "<2-3 sentence forensic conclusion>"
}

Calibration:
- 0-30: strong evidence of real recorded footage (organic sensor noise in diffs, natural motion physics)
- 31-50: probably real but some ambiguous features
- 51-74: ambiguous — some AI-like signals but not conclusive
- 75-100: clear AI artifacts — structured diff noise, biomechanics failures, or texture inconsistencies`;
}

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function parseVisionResponse(text: string): VisionAnalysisResult | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as {
      aiGeneratedProbability?: unknown;
      signals?: unknown;
      reasoning?: unknown;
    };
    const prob = Number(parsed.aiGeneratedProbability);
    if (isNaN(prob)) return null;
    return {
      aiProbability: Math.min(100, Math.max(0, Math.round(prob))),
      signals: Array.isArray(parsed.signals) ? parsed.signals.map(String) : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return null;
  }
}

/**
 * Compute frame-to-frame pixel difference images, amplified 8× for visibility.
 * Used to reveal temporal noise patterns that distinguish real vs AI video.
 * Real cameras: organic scattered sensor noise in static regions.
 * AI video: zero noise (perfectly black diffs) or structured/patterned noise.
 */
async function computeTemporalDiffs(frames: Buffer[]): Promise<Buffer[]> {
  if (frames.length < 2) return [];
  try {
    const sharp = (await import('sharp')).default;
    const diffs: Buffer[] = [];
    const TARGET_W = 360;
    const TARGET_H = 640;

    // Pre-resize all frames to a standard size for pixel comparison
    const resized = await Promise.all(
      frames.map(f =>
        sharp(f)
          .resize(TARGET_W, TARGET_H, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
      ),
    );

    for (let i = 1; i < resized.length; i++) {
      const { data: d1 } = resized[i - 1];
      const { data: d2, info } = resized[i];
      const diffData = Buffer.alloc(d1.length);
      for (let j = 0; j < d1.length; j++) {
        // Amplify difference 8× — makes subtle noise visible
        diffData[j] = Math.min(255, Math.abs(d1[j] - d2[j]) * 8);
      }
      const diffImg = await sharp(diffData, {
        raw: { width: info.width, height: info.height, channels: info.channels },
      })
        .jpeg({ quality: 90 })
        .toBuffer();
      diffs.push(diffImg);
    }

    return diffs;
  } catch {
    // sharp not available — skip temporal diff
    return [];
  }
}

/**
 * Analyze a single image buffer for AI generation artifacts using Claude vision.
 * Returns null if ANTHROPIC_API_KEY is not set or on any error.
 */
export async function analyzeImageContent(
  buffer: Buffer,
  mimeType: string,
): Promise<VisionAnalysisResult | null> {
  const client = getClient();
  if (!client) return null;

  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mediaType = supportedTypes.includes(mimeType)
    ? (mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
    : 'image/jpeg';

  try {
    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 512,
      system: 'You are a forensic media analyst. Be accurate and balanced — both false positives and false negatives are harmful. Only flag content as AI-generated when you see clear, specific evidence.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: buffer.toString('base64'),
              },
            },
            { type: 'text', text: IMAGE_ANALYSIS_PROMPT },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const result = parseVisionResponse(text);
    if (result) {
      console.log(`[vision] Image analysis: ${result.aiProbability}% AI probability`);
    }
    return result;
  } catch (err) {
    console.error('[vision] Image analysis error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Analyze extracted video frames for AI generation artifacts.
 * Uses two complementary approaches:
 * 1. Regular frames: visual content analysis
 * 2. Temporal difference frames: pixel-level noise pattern analysis
 *    (the most reliable forensic signal for distinguishing real vs AI video)
 */
export async function analyzeVideoFrames(
  frames: Buffer[],
): Promise<VisionAnalysisResult | null> {
  const client = getClient();
  if (!client || frames.length === 0) return null;

  const selected = frames.slice(0, 3);

  // Compute temporal difference frames — this is the key forensic technique
  const diffFrames = await computeTemporalDiffs(selected);
  console.log(`[vision] Computed ${diffFrames.length} temporal diff frames`);

  // Build content: regular frames first, then diff frames
  const imageBlocks: Anthropic.ImageBlockParam[] = [
    ...selected.map(f => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.toString('base64') },
    })),
    ...diffFrames.map(f => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.toString('base64') },
    })),
  ];

  const prompt = buildVideoPrompt(selected.length, diffFrames.length);

  try {
    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 768,
      system: 'You are a forensic media analyst specialising in AI-generated video detection. The temporal difference frames are the most important forensic signal — examine them carefully. AI video often has unnaturally smooth or structured noise in static regions. Only flag as AI-generated when you see clear evidence, not just ambiguous signals.',
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const result = parseVisionResponse(text);
    if (result) {
      console.log(`[vision] Video analysis: ${result.aiProbability}% AI probability (${selected.length} frames + ${diffFrames.length} diffs)`);
    }
    return result;
  } catch (err) {
    console.error('[vision] Video analysis error:', err instanceof Error ? err.message : err);
    return null;
  }
}
