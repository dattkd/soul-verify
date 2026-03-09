import Anthropic from '@anthropic-ai/sdk';

export interface VisionAnalysisResult {
  aiProbability: number; // 0-100
  signals: string[];
  reasoning: string;
}

const VISION_MODEL = 'claude-sonnet-4-6';

const IMAGE_ANALYSIS_PROMPT = `You are a forensic digital media analyst specialising in detecting AI-generated images from 2024-2026 generators: Flux 1.1 Pro, Midjourney v6/v7, DALL-E 3, Stable Diffusion 3, Firefly 3, Ideogram v3, and similar.

CRITICAL CONTEXT: Modern AI generators are specifically engineered to defeat classic detectors. They produce near-photorealistic output. You must look for the NEW generation of subtle artifacts, not just old ones like melted hands.

FORENSIC SIGNALS — CHECK EACH CAREFULLY:

SKIN & BIOLOGY (2026 generators still fail here):
- Pore structure that is hyper-uniform or hyper-random — real skin has irregular micro-patterns that vary naturally by facial zone; AI skin tends to tile
- Hair: individual strands that are too uniformly spaced or clump into bundles; AI struggles with strand-level complexity at scalp boundaries
- Eyes: iris texture that looks "painted on"; catchlights that are geometrically perfect; eyelashes that are too evenly distributed
- Neck-to-face boundary: skin tone transitions that are subtly wrong; AI often fails to match face and neck lighting perfectly

HANDS (still the #1 AI failure in 2026):
- Finger proportions wrong relative to palm — even subtle mismatches are significant
- Knuckle detail that looks stamped or copy-pasted across fingers
- Fingernail shape inconsistencies: too perfect OR wrong curvature

BACKGROUND INTELLIGENCE:
- AI populates backgrounds with contextually "too perfect" objects — scenes feel art-directed even in casual shots
- Background text (signs, labels, screens): may look legible at a glance but contains subtle letter errors or wrong character spacing
- Shadows from background objects that don't match the main subject's light source direction

LIGHTING & PHYSICS:
- Multiple shadows with different softness levels (impossible from single light source)
- Glasses/eyes/shiny surfaces: reflections that don't match the visible environment
- Fabric that looks rigid, poured, or follows impossible physics — AI struggles with cloth drape
- "Studio quality" lighting on what should be a casual/spontaneous shot

COMPOSITION FORENSICS:
- Perfectly composed shots with rule-of-thirds or golden ratio framing — AI tends toward ideal composition
- Subject perfectly in focus, background perfectly blurred — too optically perfect for the lens implied
- No accidental foreground occlusion, no partially-cut objects at edges — AI avoids "mistakes"
- The image feels "complete" and intentional even for supposedly candid content

CAMERA & SENSOR AUTHENTICITY:
- Absence of chromatic aberration at high-contrast edges (real lenses always have some)
- No lens vignetting whatsoever
- Color gamut feels wide/saturated — AI tends to boost saturation slightly versus real cameras
- No sensor noise in shadow areas — real cameras always have grain in dark regions
- No motion blur on fast-moving elements despite apparent motion

Respond ONLY with valid JSON — no markdown, no code fences:
{
  "aiGeneratedProbability": <integer 0-100>,
  "signals": [<array of max 3 short, punchy observations — one line each, no jargon>],
  "reasoning": "<1 confident sentence saying what you found and why>"
}

Calibration:
- 0-25: strong evidence of real photograph
- 26-50: probably real
- 51-64: likely AI
- 65-100: clearly AI-generated`;

/**
 * Build the video analysis prompt dynamically based on what frames we're sending.
 * frameCount = regular frames, diffCount = temporal difference frames.
 * diffStats = per-diff mean and stddev of pixel values.
 */
function buildVideoPrompt(frameCount: number, diffCount: number, diffStats?: { mean: number; std: number }[]): string {
  const hasDiffs = diffCount > 0;
  const statsText = diffStats && diffStats.length > 0
    ? `\nTEMPORAL DIFF STATISTICS (computed before sending):\n${diffStats.map((s, i) => `  Diff ${i + 1}: mean pixel=${s.mean.toFixed(1)}, std=${s.std.toFixed(1)} — ${s.mean < 3 ? 'NEAR ZERO (suspicious — too clean for real sensor)' : s.mean > 20 ? 'HIGH ACTIVITY (motion or noise present)' : 'moderate activity'}`).join('\n')}\nReal camera sensor noise in static regions: mean ~4-12, std ~3-8. Mean <3 in static areas = unnaturally clean = AI indicator.\n`
    : '';

  return `You are an expert forensic analyst detecting AI-generated video from 2024-2026 generators: Sora (OpenAI), Kling 2.0 (Kuaishou), Runway Gen-3 Alpha, HunyuanVideo (Tencent), Wan2.1, Pika 2.2, Hailuo (MiniMax), and similar.

CRITICAL: These generators are specifically designed to fool detectors. Surface realism is no longer a reliable signal. Focus on the forensic signals that current generators still cannot fake.

You are examining ${frameCount} regular video frames${hasDiffs ? ` AND ${diffCount} TEMPORAL DIFFERENCE frames` : ''}.
${statsText}${hasDiffs ? `
TEMPORAL DIFFERENCE FRAMES — THE MOST RELIABLE SIGNAL:
These show amplified pixel changes between consecutive frames. Study them with extreme care.
- REAL camera footage: static backgrounds (walls, floors, sky) show scattered, organic, grain-like noise dots — this is sensor thermal noise and compression artifacts. It looks random and uniform.
- AI video: static regions are often PERFECTLY CLEAN (near-black diff = mean <3) because AI generators render each frame independently without simulating sensor noise. OR static regions show STRUCTURED patterns: gradients, tiling, or correlated noise — signs of latent space interpolation.
- Motion boundaries in real video: natural blur transitions. In AI video: too sharp or "floating" edges where the model struggles to interpolate motion.
` : ''}

BIOLOGICAL MOTION — AI'S MOST PERSISTENT FAILURE:
- BREATHING: real humans show subtle chest/shoulder movement every 3-5 seconds even in "still" shots. AI humans are unnaturally static when not explicitly animated.
- MICRO-TREMORS: real people have imperceptible 2-8Hz hand/head tremors from muscle activity. AI humans are perfectly still.
- EYE MOVEMENT: real eyes dart and refocus constantly; AI eyes may be too stable or blink at mechanically regular intervals.
- WEIGHT & INERTIA: when real people shift weight, the motion has appropriate acceleration/deceleration. AI motion can look gliding or weightless.

GENERATOR-SPECIFIC SIGNATURES (2025-2026):
- SORA: cinematic perfection — lighting too good, camera movement too smooth for amateur footage, "dream-like" physics, subjects look too polished for the supposed context
- KLING 2.0: excellent human motion overall but subtle face texture inconsistencies during rapid movement; characteristic smooth background blur
- RUNWAY GEN-3: slightly washed-out color palette, characteristic soft bokeh that looks painted, good temporal consistency but subtle "shimmer" at edges
- HUNYUANVIDEO: strong temporal consistency but specific texture compression artifacts in fast-moving hair/fabric
- PIKA: characteristic "floating" subjects that don't feel fully grounded in the scene
- HAILUO: very good for short clips, but specific motion physics issues with object interactions

PHYSICS & MATERIAL BEHAVIOR:
- Cloth and hair: real fabric/hair has complex fluid dynamics across frames. AI cloth often looks rigid between frames or "poured" rather than draped.
- Liquids and smoke: AI struggles with splashing, smoke dissipation, and flame flicker — often looks looped or too smooth.
- Gravity: falling objects, collapsing structures, bouncing items — real physics has specific acceleration curves; AI often linearizes these.
- Rigid body interactions: when objects touch or collide, AI often has penetration artifacts or "snapping" rather than natural contact.

CAMERA BEHAVIOR:
- Real handheld footage: organic micro-shake that CORRELATES with the scene action (person moves → camera reacts slightly)
- AI "found footage": shake that doesn't correlate with scene; OR unnaturally stable despite supposed handheld capture
- Real cameras: lens breathing, slight focus shifts, chromatic aberration
- AI video: often has "infinite depth of field" effect or unnaturally perfect focus tracking

SUBJECT-ENVIRONMENT INTEGRATION:
- Do humans cast shadows that match all light sources, including fill lights and ambient light?
- Do reflective surfaces (floors, glasses, eyes) show accurate reflections that update as subjects move?
- Hair boundary with background: real hair has complex edge detail; AI hair often has a subtle "matte" or halo effect

SOCIAL MEDIA / VIRAL CONTENT CONTEXT:
Much AI content is designed to look like viral phone footage. Specific signals:
- "Too perfect" framing for supposedly spontaneous events
- Absence of bystanders, witnesses, or the visual chaos of real events
- Event timing that's too perfectly captured — real events are messy; AI events are cinematically composed
- Lighting that is inconsistent with the claimed time/location

Respond ONLY with valid JSON — no markdown, no code fences:
{
  "aiGeneratedProbability": <integer 0-100>,
  "signals": [<array of max 3 short, punchy observations — one line each, no jargon>],
  "reasoning": "<1 confident sentence saying what you found and why>"
}

Calibration:
- 0-25: strong evidence of real footage
- 26-50: probably real
- 51-64: likely AI
- 65-100: clearly AI-generated`;
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

interface DiffResult {
  images: Buffer[];
  stats: { mean: number; std: number }[];
}

/**
 * Compute frame-to-frame pixel difference images + statistics.
 * Stats (mean/std of raw diff values before amplification) are fed to Claude as text context.
 * Real cameras: mean ~4-12 in static regions (thermal + shot noise).
 * AI video: mean <3 (unnaturally clean) or structured patterns.
 */
async function computeTemporalDiffs(frames: Buffer[]): Promise<DiffResult> {
  if (frames.length < 2) return { images: [], stats: [] };
  try {
    const sharp = (await import('sharp')).default;
    const images: Buffer[] = [];
    const stats: { mean: number; std: number }[] = [];
    const TARGET_W = 480;
    const TARGET_H = 854;

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
      const rawDiffs: number[] = [];
      const diffData = Buffer.alloc(d1.length);

      for (let j = 0; j < d1.length; j++) {
        const raw = Math.abs(d1[j] - d2[j]);
        rawDiffs.push(raw);
        diffData[j] = Math.min(255, raw * 8);
      }

      // Compute mean and std of raw (unamplified) diff values
      const mean = rawDiffs.reduce((a, b) => a + b, 0) / rawDiffs.length;
      const variance = rawDiffs.reduce((a, b) => a + (b - mean) ** 2, 0) / rawDiffs.length;
      stats.push({ mean: Math.round(mean * 10) / 10, std: Math.round(Math.sqrt(variance) * 10) / 10 });

      const diffImg = await sharp(diffData, {
        raw: { width: info.width, height: info.height, channels: info.channels },
      })
        .jpeg({ quality: 90 })
        .toBuffer();
      images.push(diffImg);
    }

    return { images, stats };
  } catch {
    return { images: [], stats: [] };
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
      max_tokens: 256,
      system: 'You are a media analyst detecting AI-generated content. Be direct and confident. Keep signals short and plain — no jargon.',
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

  // Compute temporal difference frames with statistics
  const diffResult = await computeTemporalDiffs(selected);
  console.log(`[vision] Computed ${diffResult.images.length} temporal diff frames, stats: ${JSON.stringify(diffResult.stats)}`);

  const imageBlocks: Anthropic.ImageBlockParam[] = [
    ...selected.map(f => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.toString('base64') },
    })),
    ...diffResult.images.map(f => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.toString('base64') },
    })),
  ];

  const prompt = buildVideoPrompt(selected.length, diffResult.images.length, diffResult.stats);

  try {
    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 256,
      system: 'You are a media analyst detecting AI-generated video. Be direct and confident. Keep signals short and plain — no jargon.',
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
      console.log(`[vision] Video analysis: ${result.aiProbability}% AI probability (${selected.length} frames + ${diffResult.images.length} diffs)`);
    }
    return result;
  } catch (err) {
    console.error('[vision] Video analysis error:', err instanceof Error ? err.message : err);
    return null;
  }
}
