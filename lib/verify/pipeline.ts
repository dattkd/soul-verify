import { prisma } from '../db/client';
import { getStorage, generateStorageKey } from '../storage';
import { sha256, perceptualHashImage, hammingDistance } from '../media/hash';
import { extractExif } from '../media/exif';
import { extractVideoMetadata, extractFramesFromBuffer } from '../media/video';
import { detectAiImage, detectAiVideo } from '../media/aiDetection';
import { analyzeImageContent, analyzeVideoFrames, analyzeTextContent } from '../media/visionAnalysis';
import { detectImageWithHive, detectVideoFramesWithHive } from '../media/hiveDetection';
import { detectVideoWithSightengine, detectImageWithSightengine } from '../media/sightengineDetection';
import { detectImageWithAiOrNot, detectVideoWithAiOrNot } from '../media/aiornot';
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
  // Do NOT filter fields — let the API return everything so we catch thumbnail_url_with_play_button too (Reels)
  const oembedUrl = accessToken
    ? `${oembedBase}?url=${encodeURIComponent(postUrl)}&access_token=${accessToken}`
    : `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}`;

  try {
    const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (!oembedRes.ok) {
      console.warn('[instagram] oEmbed failed:', oembedRes.status, await oembedRes.text().catch(() => ''));
      return null;
    }
    const data = await oembedRes.json() as { thumbnail_url?: string; thumbnail_url_with_play_button?: string };
    // Reels often only expose thumbnail_url_with_play_button, not bare thumbnail_url
    const thumbUrl = data.thumbnail_url ?? data.thumbnail_url_with_play_button;
    if (!thumbUrl) {
      console.warn('[instagram] oEmbed: no thumbnail field in response, keys:', Object.keys(data).join(', '));
      return null;
    }

    const imgRes = await fetch(thumbUrl, { signal: AbortSignal.timeout(15000) });
    if (!imgRes.ok) return null;
    const ct = imgRes.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    console.log('[instagram] oEmbed thumbnail downloaded:', thumbUrl.slice(0, 60) + '…');
    return { buffer: Buffer.from(await imgRes.arrayBuffer()), mimeType: ct.split(';')[0] };
  } catch (err) {
    console.warn('[instagram] oEmbed error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Scrape Open Graph tags from any public URL.
 * Returns og:image URL (if found) and og:description for text analysis.
 */
async function fetchOgData(pageUrl: string): Promise<{ imageUrl: string | null; text: string }> {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoulVerify/1.0)' },
    });
    if (!res.ok) return { imageUrl: null, text: '' };
    const html = await res.text();
    const ogImage   = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
    const ogDesc    = html.match(/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
    const ogTitle   = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
    return { imageUrl: ogImage ?? null, text: [ogTitle, ogDesc].filter(Boolean).join(' — ') };
  } catch {
    return { imageUrl: null, text: '' };
  }
}

/** Download an image from a URL and return its buffer + mime type. */
async function fetchImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    if (!ct.startsWith('image/')) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: ct.split(';')[0] };
  } catch {
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
    let ogTextFallback = ''; // og:title + og:description when no media could be fetched

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
          // Download failed — try oEmbed thumbnail, then og:image scrape
          const thumb = await fetchInstagramThumbnail(input.sourceUrl);
          if (thumb) {
            buffer = thumb.buffer;
            mimeType = thumb.mimeType;
            thumbnailOnly = true;
          } else {
            // Final fallback: scrape og:image + og:description from the page HTML
            const og = await fetchOgData(input.sourceUrl);
            if (og.imageUrl) {
              const fetched = await fetchImageBuffer(og.imageUrl);
              if (fetched) { buffer = fetched.buffer; mimeType = fetched.mimeType; thumbnailOnly = true; }
            }
            if (!buffer && og.text) {
              // Text-only analysis path
              ogTextFallback = og.text;
            }
            if (!buffer && !ogTextFallback) {
              await finishInsufficient(
                jobId,
                'Could not download this Instagram content. Make sure the post is public, then try again. You can also download the file and upload it directly.',
              );
              return;
            }
          }
        } else {
          // For all other platforms: try og:image scrape before giving up
          const og = await fetchOgData(input.sourceUrl);
          if (og.imageUrl) {
            const fetched = await fetchImageBuffer(og.imageUrl);
            if (fetched) { buffer = fetched.buffer; mimeType = fetched.mimeType; thumbnailOnly = true; }
          }
          if (!buffer && og.text) {
            ogTextFallback = og.text;
          }
          if (!buffer && !ogTextFallback) {
            const name = platform.charAt(0).toUpperCase() + platform.slice(1);
            await finishInsufficient(
              jobId,
              `Could not download ${name} content. Make sure the post is public, then try again.`,
            );
            return;
          }
        }
      } else {
        // Regular URL — fetch and check content type
        const res = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`Failed to fetch source URL: ${res.status}`);
        const ct = res.headers.get('content-type') ?? '';
        if (ct.startsWith('text/html') || ct.startsWith('text/plain')) {
          // HTML page — try og:image scrape + text analysis
          const og = await fetchOgData(input.sourceUrl);
          if (og.imageUrl) {
            const fetched = await fetchImageBuffer(og.imageUrl);
            if (fetched) { buffer = fetched.buffer; mimeType = fetched.mimeType; thumbnailOnly = true; }
          }
          if (!buffer && og.text) {
            ogTextFallback = og.text;
          }
          if (!buffer && !ogTextFallback) {
            await finishInsufficient(
              jobId,
              'The URL returned an HTML page with no detectable media. Submit a direct link to an image or video file.',
            );
            return;
          }
        } else {
          buffer = Buffer.from(await res.arrayBuffer());
          mimeType = ct.split(';')[0] || mimeType;
        }
      }
    }

    // Text-only analysis path — when no media buffer was obtained but we have OG text
    if (!buffer && ogTextFallback) {
      const textResult = await analyzeTextContent(ogTextFallback);
      const aiProb = textResult?.aiProbability ?? 0;
      const verdict = aiProb >= 65
        ? Verdict.LIKELY_AI_GENERATED
        : aiProb >= 26
          ? Verdict.INSUFFICIENT_EVIDENCE
          : Verdict.LIKELY_ORIGINAL;
      const confidence = aiProb >= 65 ? Math.round(aiProb * 0.8) : aiProb <= 25 ? Math.round((100 - aiProb) * 0.6) : 30;
      const explanation = textResult
        ? `Text analysis only (no media available): ${textResult.reasoning}`
        : 'No media could be retrieved. Only page text was analyzed — results may be limited.';

      await prisma.analysisResult.create({
        data: { jobId, verdict, confidence, explanation, summaryJson: { signalCount: textResult ? 1 : 0, textOnly: true } },
      });

      if (textResult) {
        await prisma.evidenceSignal.create({
          data: {
            jobId,
            category: 'content',
            name: 'text_ai_probability',
            value: `${textResult.aiProbability}`,
            scoreImpact: 0,
            detailsJson: { reasoning: textResult.reasoning, signals: textResult.signals } as object,
          },
        });
      }

      await prisma.publicReport.create({ data: { jobId, isPublic: true } });
      await prisma.verificationJob.update({ where: { id: jobId }, data: { status: 'completed', completedAt: new Date() } });
      return;
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

    // Run all detectors in parallel — AI or Not is the primary trained detector,
    // Claude vision adds reasoning + temporal diff forensics, Sightengine/Hive fill gaps.
    const [visionResult, hiveResult, sightengineVideoResult, sightengineImageScore, aiOrNotImageResult, aiOrNotVideoResult] = await Promise.all([
      isImage
        ? analyzeImageContent(buffer, mimeType)
        : (isVideo && extractedFrames.length > 0 ? analyzeVideoFrames(extractedFrames) : Promise.resolve(null)),
      isImage ? detectImageWithHive(buffer, mimeType) : Promise.resolve(null),
      isVideo ? detectVideoWithSightengine(buffer, input.originalFilename ?? 'media.mp4') : Promise.resolve(null),
      isImage ? detectImageWithSightengine(buffer, mimeType) : Promise.resolve(null),
      isImage ? detectImageWithAiOrNot(buffer, mimeType) : Promise.resolve(null),
      isVideo ? detectVideoWithAiOrNot(buffer, input.originalFilename ?? 'media.mp4') : Promise.resolve(null),
    ]);

    const heuristicScore = aiDetection?.suspicionScore ?? 0;
    const visionScore = visionResult?.aiProbability ?? 0;
    const hiveScore = hiveResult?.aiProbability ?? 0;
    const sightengineScore = isVideo
      ? (sightengineVideoResult?.aiProbability ?? 0)
      : (sightengineImageScore ?? 0);
    // AI or Not: primary trained detector — use video score OR image score
    const aiOrNotScore = isVideo
      ? (aiOrNotVideoResult?.aiVideoProbability ?? 0)
      : (aiOrNotImageResult?.aiProbability ?? 0);

    // Ensemble: max from all detectors (any strong signal wins),
    // plus consensus boost when multiple independent detectors agree.
    const detectorScores = [visionScore, hiveScore, sightengineScore, aiOrNotScore];
    const maxDetectorScore = Math.max(...detectorScores, heuristicScore);
    const agreeingDetectors = detectorScores.filter(s => s >= 50).length;
    const consensusBoost = agreeingDetectors >= 3 ? 12 : agreeingDetectors >= 2 ? 6 : 0;
    const combinedAiScore = Math.min(100, maxDetectorScore + consensusBoost);
    console.log(`[pipeline] AiOrNot: ${aiOrNotScore}% | SE: ${sightengineScore}% | Hive: ${hiveScore}% | Vision: ${visionScore}% | Heuristic: ${heuristicScore}% | consensus+${consensusBoost} → combined: ${combinedAiScore}%`);

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
          aiOrNotScore: aiOrNotScore > 0 ? aiOrNotScore : null,
          aiOrNotGenerator: aiOrNotImageResult?.detectedGenerator ?? null,
          aiOrNotDeepfake: aiOrNotImageResult?.isDeepfake || aiOrNotVideoResult?.isDeepfake || null,
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
      aiSuspicionScore: combinedAiScore,
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

    // Store AI or Not detection results
    if (aiOrNotImageResult) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: 'content',
          name: 'aiornot_ai_probability',
          value: `${aiOrNotImageResult.aiProbability}`,
          scoreImpact: 0,
          detailsJson: {
            isDeepfake: aiOrNotImageResult.isDeepfake,
            detectedGenerator: aiOrNotImageResult.detectedGenerator,
            generatorConfidence: aiOrNotImageResult.generatorConfidence,
          } as object,
        },
      });
    } else if (aiOrNotVideoResult) {
      await prisma.evidenceSignal.create({
        data: {
          jobId,
          category: 'content',
          name: 'aiornot_ai_probability',
          value: `${aiOrNotVideoResult.aiVideoProbability}`,
          scoreImpact: 0,
          detailsJson: {
            aiVideoProbability: aiOrNotVideoResult.aiVideoProbability,
            aiVoiceProbability: aiOrNotVideoResult.aiVoiceProbability,
            isDeepfake: aiOrNotVideoResult.isDeepfake,
            deepfakeConfidence: aiOrNotVideoResult.deepfakeConfidence,
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
