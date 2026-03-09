import { prisma } from '../db/client';
import { getStorage, generateStorageKey } from '../storage';
import { sha256, perceptualHashImage, hammingDistance } from '../media/hash';
import { extractExif } from '../media/exif';
import { extractVideoMetadata, extractFramesFromBuffer } from '../media/video';
import { detectAiImage, detectAiVideo } from '../media/aiDetection';
import { analyzeImageContent, analyzeVideoFrames } from '../media/visionAnalysis';
import { detectImageWithHive, detectVideoFramesWithHive } from '../media/hiveDetection';
import { detectVideoWithSightengine, detectImageWithSightengine } from '../media/sightengineDetection';
import { downloadSocialMedia } from '../media/socialDownload';
import { computeVerdict } from '../scoring/engine';
import { checkProvenance } from '../provenance';
import type { ScoringInput } from '../scoring/types';
import { Verdict } from '../scoring/types';
import path from 'path';

export interface PipelineInput {
  jobId: string;
  buffer?: Buffer;
  sourceUrl?: string;
  mimeType?: string;
  originalFilename?: string;
}

// Social platforms that gate media behind login walls or JS rendering
const SOCIAL_HOSTNAMES = new Set([
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com',
  'twitter.com', 'x.com', 'www.twitter.com', 'www.x.com',
  'facebook.com', 'www.facebook.com', 'fb.com',
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'threads.net', 'www.threads.net',
]);

function getSocialPlatform(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    if (!SOCIAL_HOSTNAMES.has(hostname.toLowerCase())) return null;
    return hostname.replace(/^www\./, '').split('.')[0];
  } catch { return null; }
}

/**
 * Fetch an Instagram post thumbnail via the Graph API oEmbed endpoint.
 * Requires INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in env.
 * Works for any public post (photos, reels, carousels).
 */
async function fetchInstagramThumbnail(postUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  // Build the oEmbed URL — use app token if available, else try unauthenticated (usually fails)
  const accessToken = appId && appSecret ? `${appId}|${appSecret}` : null;
  const oembedBase = 'https://graph.facebook.com/v21.0/instagram_oembed';
  const oembedUrl = accessToken
    ? `${oembedBase}?url=${encodeURIComponent(postUrl)}&fields=thumbnail_url&access_token=${accessToken}`
    : `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}`;

  try {
    const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (!oembedRes.ok) {
      console.warn('[instagram] oEmbed failed:', oembedRes.status, await oembedRes.text().catch(() => ''));
      return null;
    }
    const data = await oembedRes.json() as { thumbnail_url?: string };
    if (!data.thumbnail_url) return null;

    const imgRes = await fetch(data.thumbnail_url, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) return null;
    const ct = imgRes.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    console.log('[instagram] oEmbed thumbnail downloaded:', data.thumbnail_url.slice(0, 60) + '…');
    return { buffer: Buffer.from(await imgRes.arrayBuffer()), mimeType: ct.split(';')[0] };
  } catch (err) {
    console.warn('[instagram] oEmbed error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Complete a job with INSUFFICIENT_EVIDENCE and a human-readable reason. */
async function finishInsufficient(jobId: string, explanation: string): Promise<void> {
  await prisma.analysisResult.create({
    data: {
      jobId,
      verdict: Verdict.INSUFFICIENT_EVIDENCE,
      confidence: 0,
      explanation,
      summaryJson: { signalCount: 0 },
    },
  });
  await prisma.publicReport.create({ data: { jobId, isPublic: true } });
  await prisma.verificationJob.update({
    where: { id: jobId },
    data: { status: 'completed', completedAt: new Date() },
  });
}

export async function runVerificationPipeline(input: PipelineInput): Promise<void> {
  const { jobId } = input;

  await prisma.verificationJob.update({ where: { id: jobId }, data: { status: 'processing' } });

  try {
    let buffer = input.buffer;
    let mimeType = input.mimeType ?? 'application/octet-stream';
    let thumbnailOnly = false; // true when we could only retrieve a platform thumbnail, not the source file

    if (!buffer && input.sourceUrl) {
      const platform = getSocialPlatform(input.sourceUrl);

      if (platform) {
        // Social platform URL — try yt-dlp first, then oEmbed thumbnail, then fail gracefully
        const downloaded = await downloadSocialMedia(input.sourceUrl);
        if (downloaded) {
          buffer = downloaded.buffer;
          mimeType = downloaded.mimeType;
          // Update the originalFilename hint so the pipeline picks the right extension
          if (!input.originalFilename) input.originalFilename = downloaded.filename;
        } else if (platform === 'instagram') {
          // yt-dlp failed — try oEmbed thumbnail as last resort
          const thumb = await fetchInstagramThumbnail(input.sourceUrl);
          if (thumb) {
            buffer = thumb.buffer;
            mimeType = thumb.mimeType;
            thumbnailOnly = true;
          } else {
            await finishInsufficient(
              jobId,
              'Could not download this Instagram post. Photo-only posts cannot be fetched automatically — download the image and upload it directly. Videos and Reels work via URL.',
            );
            return;
          }
        } else {
          const name = platform.charAt(0).toUpperCase() + platform.slice(1);
          await finishInsufficient(
            jobId,
            `Could not download ${name} content via yt-dlp. Make sure the post is public, then try again.`,
          );
          return;
        }
      } else {
        // Regular URL — fetch and validate content type
        const res = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`Failed to fetch source URL: ${res.status}`);
        const ct = res.headers.get('content-type') ?? '';
        if (ct.startsWith('text/html') || ct.startsWith('text/plain')) {
          await finishInsufficient(
            jobId,
            'The URL returned an HTML page rather than a media file. Submit a direct link to an image or video file.',
          );
          return;
        }
        buffer = Buffer.from(await res.arrayBuffer());
        mimeType = ct.split(';')[0] || mimeType;
      }
    }

    if (!buffer) throw new Error('No media buffer available');

    const storage = getStorage();
    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');
    const ext = path.extname(input.originalFilename ?? '') || (isImage ? '.jpg' : isVideo ? '.mp4' : '.bin');
    const storageKey = generateStorageKey('assets', ext);

    await storage.put(storageKey, buffer, mimeType);

    const fileHash = sha256(buffer);
    const pHash = isImage ? await perceptualHashImage(buffer) : null;
    const exif = isImage ? await extractExif(buffer, mimeType) : null;
    const hasExif = exif !== null && Object.keys(exif).length > 0;
    const exifStripped = isImage && !hasExif;

    let videoMeta = null;
    if (isVideo) {
      const os = await import('os');
      const fsModule = await import('fs/promises');
      const tmpPath = `${os.tmpdir()}/soul_video_${Date.now()}${ext}`;
      try {
        await fsModule.writeFile(tmpPath, buffer);
        videoMeta = await extractVideoMetadata(tmpPath);
        await fsModule.rm(tmpPath, { force: true });
      } catch { /* ffprobe unavailable */ }
    }

    // Extract video frames early — needed for both vision analysis and storage
    let extractedFrames: Buffer[] = [];
    if (isVideo) {
      try {
        extractedFrames = await extractFramesFromBuffer(buffer, 3);
      } catch { /* ffmpeg unavailable */ }
    }

    // Heuristic AI detection
    const aiDetection = isImage
      ? detectAiImage(exif, exif?.width ?? null, exif?.height ?? null, buffer.length)
      : (isVideo && videoMeta)
        ? detectAiVideo(videoMeta, buffer.length)
        : null;

    // Run all detectors in parallel:
    // - Images: Hive (pixel fingerprinting) + Sightengine + Claude vision
    // - Video:  Sightengine (raw video file — most accurate) + Claude (temporal diffs)
    //   Hive image model is NOT used on video frames — re-encoding destroys its fingerprints.
    const [visionResult, hiveResult, sightengineVideoResult, sightengineImageScore] = await Promise.all([
      isImage
        ? analyzeImageContent(buffer, mimeType)
        : (isVideo && extractedFrames.length > 0 ? analyzeVideoFrames(extractedFrames) : Promise.resolve(null)),
      isImage ? detectImageWithHive(buffer, mimeType) : Promise.resolve(null),
      isVideo ? detectVideoWithSightengine(buffer, input.originalFilename ?? 'media.mp4') : Promise.resolve(null),
      isImage ? detectImageWithSightengine(buffer, mimeType) : Promise.resolve(null),
    ]);

    const heuristicScore = aiDetection?.suspicionScore ?? 0;
    const visionScore = visionResult?.aiProbability ?? 0;
    const hiveScore = hiveResult?.aiProbability ?? 0;
    const sightengineScore = isVideo
      ? (sightengineVideoResult?.aiProbability ?? 0)
      : (sightengineImageScore ?? 0);

    const combinedAiScore = Math.max(heuristicScore, visionScore, hiveScore, sightengineScore);
    console.log(`[pipeline] SE: ${sightengineScore}% | Hive: ${hiveScore}% | Claude: ${visionScore}% | Heuristic: ${heuristicScore}% → combined: ${combinedAiScore}%`);

    const provenance = await checkProvenance(buffer, mimeType);
    const existingByHash = await prisma.asset.findFirst({ where: { sha256: fileHash } });
    const duplicateFound = !!existingByHash;

    let nearDuplicateFound = false;
    if (pHash && !duplicateFound) {
      const recentAssets = await prisma.asset.findMany({
        where: { perceptualHash: { not: null } },
        take: 1000,
        orderBy: { createdAt: 'desc' },
      });
      nearDuplicateFound = recentAssets.some(a => {
        if (!a.perceptualHash) return false;
        try { return hammingDistance(pHash, a.perceptualHash) <= 8; }
        catch { return false; }
      });
    }

    const asset = await prisma.asset.create({
      data: {
        jobId,
        originalFilename: input.originalFilename ?? null,
        mimeType,
        sizeBytes: buffer.length,
        storageKey,
        sha256: fileHash,
        perceptualHash: pHash,
        width: exif?.width ?? videoMeta?.width ?? null,
        height: exif?.height ?? videoMeta?.height ?? null,
        durationMs: videoMeta?.durationMs ?? null,
        codec: videoMeta?.codec ?? null,
        exifJson: exif as object ?? undefined,
        metadataJson: {
          hasExif,
          exifStripped,
          softwareTag: exif?.software ?? null,
          codec: videoMeta?.codec ?? null,
          thumbnailOnly,
          aiSuspicionScore: combinedAiScore > 0 ? combinedAiScore : null,
          heuristicAiScore: heuristicScore > 0 ? heuristicScore : null,
          visionAiScore: visionScore > 0 ? visionScore : null,
          hiveAiScore: hiveScore > 0 ? hiveScore : null,
          hiveTopSource: hiveResult?.topSource ?? null,
          sightengineScore: sightengineScore > 0 ? sightengineScore : null,
        },
      },
    });

    await prisma.provenanceRecord.create({
      data: {
        assetId: asset.id,
        status: provenance.status,
        signatureType: provenance.signatureType ?? null,
        signer: provenance.signer ?? null,
        detailsJson: (provenance.details ?? {}) as object,
      },
    });

    if (isVideo && extractedFrames.length > 0) {
      for (let i = 0; i < extractedFrames.length; i++) {
        const frameKey = generateStorageKey(`frames/${asset.id}`, '.jpg');
        await storage.put(frameKey, extractedFrames[i], 'image/jpeg');
        await prisma.derivedArtifact.create({
          data: { assetId: asset.id, type: 'frame', storageKey: frameKey, sequenceIndex: i },
        });
      }
    }

    if (isImage) {
      try {
        const sharp = (await import('sharp')).default;
        const thumb = await sharp(buffer).resize(400, 400, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
        const thumbKey = generateStorageKey(`thumbs/${asset.id}`, '.jpg');
        await storage.put(thumbKey, thumb, 'image/jpeg');
        await prisma.derivedArtifact.create({
          data: { assetId: asset.id, type: 'thumbnail', storageKey: thumbKey, sequenceIndex: 0 },
        });
      } catch { /* sharp unavailable */ }
    }

    const job = await prisma.verificationJob.findUnique({ where: { id: jobId } });
    const scoringInput: ScoringInput = {
      hasExif,
      exifStripped,
      hasSoftwareTag: !!(exif?.software),
      softwareTag: exif?.software ?? undefined,
      hasTimestamp: !!(exif?.dateTimeOriginal),
      mimeType,
      sizeBytes: buffer.length,
      sha256: fileHash,
      perceptualHash: pHash ?? undefined,
      duplicateFound,
      nearDuplicateFound,
      hasProvenanceSignature: provenance.status === 'verified',
      sourceUrl: job?.sourceUrl ?? undefined,
      platform: job?.platform ?? undefined,
      isVideo,
      durationMs: videoMeta?.durationMs ?? undefined,
      codec: videoMeta?.codec ?? undefined,
      aiSuspicionScore: combinedAiScore > 0 ? combinedAiScore : undefined,
    };

    const result = computeVerdict(scoringInput);

    // Amend explanation when we only had a social thumbnail
    const explanation = thumbnailOnly
      ? `Note: only a thumbnail was retrieved from Instagram — the original video could not be fetched directly. ${result.explanation}`
      : result.explanation;

    await prisma.analysisResult.create({
      data: {
        jobId,
        verdict: result.verdict,
        confidence: result.confidence,
        explanation,
        summaryJson: { signalCount: result.signals.length },
      },
    });

    for (const signal of result.signals) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: signal.category,
          name: signal.name,
          value: signal.value,
          scoreImpact: signal.scoreImpact,
          detailsJson: (signal.details ?? {}) as object,
        },
      });
    }

    // Store individual heuristic AI detection sub-signals
    if (aiDetection && aiDetection.signals.length > 0) {
      for (const aiSig of aiDetection.signals) {
        await prisma.evidenceSignal.create({
          data: {
            jobId,
            category: 'content',
            name: aiSig.name,
            value: `weight:${aiSig.weight}`,
            scoreImpact: -aiSig.weight,
            detailsJson: { description: aiSig.description } as object,
          },
        });
      }
    }

    // Store Claude vision analysis detail
    if (visionResult) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: 'content',
          name: 'vision_ai_probability',
          value: `${visionResult.aiProbability}`,
          scoreImpact: 0,
          detailsJson: {
            reasoning: visionResult.reasoning,
            signals: visionResult.signals,
          } as object,
        },
      });
    }

    // Store Sightengine video detection result
    if (sightengineVideoResult) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: 'content',
          name: 'sightengine_ai_probability',
          value: `${sightengineVideoResult.aiProbability}`,
          scoreImpact: 0,
          detailsJson: {
            maxScore: sightengineVideoResult.aiProbability,
            avgScore: sightengineVideoResult.avgProbability,
            frameScores: sightengineVideoResult.frameScores,
          } as object,
        },
      });
    } else if (sightengineImageScore !== null) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: 'content',
          name: 'sightengine_ai_probability',
          value: `${sightengineImageScore}`,
          scoreImpact: 0,
          detailsJson: { score: sightengineImageScore } as object,
        },
      });
    }

    // Store Hive specialized detection result
    if (hiveResult) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: 'content',
          name: 'hive_ai_probability',
          value: `${hiveResult.aiProbability}`,
          scoreImpact: 0,
          detailsJson: {
            topSource: hiveResult.topSource,
            allSources: hiveResult.allSources,
          } as object,
        },
      });
    }

    await prisma.publicReport.create({ data: { jobId, isPublic: true } });

    await prisma.verificationJob.update({
      where: { id: jobId },
      data: { status: 'completed', completedAt: new Date() },
    });
  } catch (err) {
    await prisma.verificationJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: err instanceof Error ? err.message : 'Unknown error' },
    });
    throw err;
  }
}
