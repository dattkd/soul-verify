import { computeVerdict } from '../lib/scoring/engine';
import { Verdict } from '../lib/scoring/types';

describe('computeVerdict', () => {
  test('returns INSUFFICIENT_EVIDENCE when no signals present', () => {
    const result = computeVerdict({
      hasExif: false,
      exifStripped: false,
      hasSoftwareTag: false,
      hasTimestamp: false,
      duplicateFound: false,
      nearDuplicateFound: false,
      hasProvenanceSignature: false,
      isVideo: false,
    });
    expect(result.verdict).toBe(Verdict.INSUFFICIENT_EVIDENCE);
  });

  test('returns SIGNED_ORIGINAL when provenance signature present', () => {
    const result = computeVerdict({
      hasExif: true,
      exifStripped: false,
      hasSoftwareTag: false,
      hasTimestamp: true,
      duplicateFound: false,
      nearDuplicateFound: false,
      hasProvenanceSignature: true,
      isVideo: false,
      sourceUrl: 'https://example.com/image.jpg',
    });
    expect(result.verdict).toBe(Verdict.SIGNED_ORIGINAL);
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  test('returns LIKELY_REPOST when exact duplicate found', () => {
    const result = computeVerdict({
      hasExif: false,
      exifStripped: true,
      hasSoftwareTag: false,
      hasTimestamp: false,
      duplicateFound: true,
      nearDuplicateFound: false,
      hasProvenanceSignature: false,
      isVideo: false,
      sourceUrl: 'https://example.com/image.jpg',
    });
    expect(result.verdict).toBe(Verdict.LIKELY_REPOST);
  });

  test('returns LIKELY_AI_GENERATED when AI software tag present', () => {
    const result = computeVerdict({
      hasExif: true,
      exifStripped: false,
      hasSoftwareTag: true,
      softwareTag: 'Stable Diffusion v2',
      hasTimestamp: false,
      duplicateFound: false,
      nearDuplicateFound: false,
      hasProvenanceSignature: false,
      isVideo: false,
      sourceUrl: 'https://example.com/image.jpg',
    });
    expect(result.verdict).toBe(Verdict.LIKELY_AI_GENERATED);
  });

  test('confidence is clamped between 0 and 100', () => {
    const result = computeVerdict({
      hasExif: true,
      exifStripped: false,
      hasSoftwareTag: false,
      hasTimestamp: true,
      duplicateFound: false,
      nearDuplicateFound: false,
      hasProvenanceSignature: true,
      isVideo: false,
      sourceUrl: 'https://example.com/image.jpg',
      aiSuspicionScore: 5,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  test('returns LIKELY_ORIGINAL for a clean image with metadata', () => {
    const result = computeVerdict({
      hasExif: true,
      exifStripped: false,
      hasSoftwareTag: false,
      hasTimestamp: true,
      duplicateFound: false,
      nearDuplicateFound: false,
      hasProvenanceSignature: false,
      isVideo: false,
      sourceUrl: 'https://example.com/photo.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result.verdict).toBe(Verdict.LIKELY_ORIGINAL);
    expect(result.signals.length).toBeGreaterThan(0);
  });
});
