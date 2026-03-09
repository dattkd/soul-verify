import { Verdict, ScoringInput, ScoringOutput, EvidenceSignalInput } from './types';

const AI_SOFTWARE_TAGS = ['stable diffusion', 'midjourney', 'dall-e', 'firefly', 'imagen', 'generative'];
const EDITING_SOFTWARE_TAGS = ['photoshop', 'lightroom', 'gimp', 'affinity', 'snapseed'];

export function computeVerdict(input: ScoringInput): ScoringOutput {
  const signals: EvidenceSignalInput[] = [];
  const softwareTag = input.softwareTag?.toLowerCase() ?? '';
  const isAISoftware = AI_SOFTWARE_TAGS.some(t => softwareTag.includes(t));
  const isEditingSoftware = EDITING_SOFTWARE_TAGS.some(t => softwareTag.includes(t));

  // ── IMMEDIATE VERDICTS ────────────────────────────────────────────────────
  // These trump everything else — no score math needed.

  if (input.hasProvenanceSignature) {
    signals.push({ category: 'provenance', name: 'soul_signature', value: 'present', scoreImpact: 0 });
    return {
      verdict: Verdict.SIGNED_ORIGINAL,
      confidence: 100,
      explanation: 'A valid Soul provenance signature was found — this content is a confirmed original.',
      signals,
    };
  }

  if (isAISoftware) {
    signals.push({
      category: 'metadata', name: 'software_tag', value: input.softwareTag!,
      scoreImpact: 0,
      details: { description: `AI generation software detected in metadata: ${input.softwareTag}` },
    });
    return {
      verdict: Verdict.LIKELY_AI_GENERATED,
      confidence: 95,
      explanation: `Metadata contains a software tag identifying this as AI-generated: "${input.softwareTag}".`,
      signals,
    };
  }

  // ── PRIMARY SCORE: vision AI probability ─────────────────────────────────
  // score = authenticity confidence (0–100)
  // Directly inverted from vision: 80% AI probability → 20 authenticity score
  // No vision → 50 (genuinely unknown)
  const aiProb = input.aiSuspicionScore ?? 50;
  let score = 100 - aiProb;

  if (input.aiSuspicionScore !== undefined) {
    signals.push({
      category: 'content', name: 'ai_probability',
      value: `${input.aiSuspicionScore}%`,
      scoreImpact: 0,
      details: { description: `AI generation probability assessed at ${input.aiSuspicionScore}% by visual analysis.` },
    });
  }

  // ── METADATA ADJUSTMENTS (max ±12 total) ─────────────────────────────────
  // These are supporting signals, not the primary driver.

  if (input.hasExif) {
    score += 8;
    signals.push({ category: 'metadata', name: 'exif_present', value: 'yes', scoreImpact: 8 });
  } else if (input.exifStripped) {
    score -= 5;
    signals.push({
      category: 'metadata', name: 'exif_stripped', value: 'stripped', scoreImpact: -5,
      details: { description: 'Image metadata was stripped — common after social platform processing.' },
    });
  }

  if (isEditingSoftware) {
    score -= 5;
    signals.push({
      category: 'metadata', name: 'software_tag', value: input.softwareTag!, scoreImpact: -5,
      details: { description: `Editing software detected in metadata: ${input.softwareTag}` },
    });
  } else if (input.hasSoftwareTag && input.softwareTag) {
    signals.push({ category: 'metadata', name: 'software_tag', value: input.softwareTag, scoreImpact: 0 });
  }

  if (input.nearDuplicateFound) {
    score -= 5;
    signals.push({
      category: 'hash', name: 'near_duplicate', value: 'near', scoreImpact: -5,
      details: { description: 'Visually similar content found — may be a re-upload or minor edit.' },
    });
  }

  // Duplicate is purely informational — content is the same regardless of how
  // many times it has been submitted.
  if (input.duplicateFound) {
    signals.push({
      category: 'hash', name: 'seen_before', value: 'exact', scoreImpact: 0,
      details: { description: 'This exact content has been analyzed before.' },
    });
  }

  if (input.isVideo && input.codec) {
    signals.push({ category: 'compression', name: 'codec', value: input.codec, scoreImpact: 0 });
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  // ── VERDICT ───────────────────────────────────────────────────────────────
  // Primary axis: is this AI-generated or authentic?
  // Vision AI probability ≥ 75% → LIKELY_AI_GENERATED (high confidence required)
  // Authenticity score ≥ 60 → LIKELY_ORIGINAL
  // Otherwise → INSUFFICIENT_EVIDENCE (honest about uncertainty)

  let verdict: Verdict;
  if (aiProb >= 75) {
    verdict = Verdict.LIKELY_AI_GENERATED;
  } else if (isEditingSoftware && input.nearDuplicateFound) {
    verdict = Verdict.MANIPULATED_OR_EDITED;
  } else if (score >= 60) {
    verdict = Verdict.LIKELY_ORIGINAL;
  } else {
    verdict = Verdict.INSUFFICIENT_EVIDENCE;
  }

  return { verdict, confidence: score, explanation: generateExplanation(verdict, input, aiProb), signals };
}

function generateExplanation(verdict: Verdict, input: ScoringInput, aiProb: number): string {
  const parts: string[] = [];

  if (input.aiSuspicionScore !== undefined) {
    if (aiProb >= 75) {
      parts.push(`Visual analysis assessed a ${aiProb}% probability of AI generation — this content shows signals of being AI-generated.`);
    } else if (aiProb <= 25) {
      parts.push(`Visual analysis assessed a ${aiProb}% probability of AI generation — content appears authentic.`);
    } else {
      parts.push(`Visual analysis assessed a ${aiProb}% probability of AI generation — results are inconclusive.`);
    }
  } else {
    parts.push('No visual analysis was available — verdict based on metadata signals only.');
  }

  if (input.hasExif) parts.push('Original camera metadata (EXIF) is present.');
  if (input.exifStripped) parts.push('Image metadata was stripped.');
  if (input.duplicateFound) parts.push('This exact content has been analyzed before.');
  if (input.nearDuplicateFound) parts.push('Visually similar content was found in the database.');

  if (verdict === Verdict.INSUFFICIENT_EVIDENCE) {
    parts.push('There is not enough evidence to make a confident determination.');
  }

  parts.push('SOUL evaluates signals, not certainty.');
  return parts.join(' ');
}
