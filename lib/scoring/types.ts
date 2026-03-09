export enum Verdict {
  SIGNED_ORIGINAL = 'SIGNED_ORIGINAL',
  LIKELY_ORIGINAL = 'LIKELY_ORIGINAL',
  LIKELY_REPOST = 'LIKELY_REPOST',
  MANIPULATED_OR_EDITED = 'MANIPULATED_OR_EDITED',
  LIKELY_AI_GENERATED = 'LIKELY_AI_GENERATED',
  INSUFFICIENT_EVIDENCE = 'INSUFFICIENT_EVIDENCE',
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  [Verdict.SIGNED_ORIGINAL]: 'Signed Original',
  [Verdict.LIKELY_ORIGINAL]: 'Likely Original',
  [Verdict.LIKELY_REPOST]: 'Likely Repost',
  [Verdict.MANIPULATED_OR_EDITED]: 'Manipulated / Edited',
  [Verdict.LIKELY_AI_GENERATED]: 'Likely AI-Generated',
  [Verdict.INSUFFICIENT_EVIDENCE]: 'Insufficient Evidence',
};

export const VERDICT_COLORS: Record<Verdict, string> = {
  [Verdict.SIGNED_ORIGINAL]: '#22c55e',
  [Verdict.LIKELY_ORIGINAL]: '#86efac',
  [Verdict.LIKELY_REPOST]: '#f59e0b',
  [Verdict.MANIPULATED_OR_EDITED]: '#ef4444',
  [Verdict.LIKELY_AI_GENERATED]: '#a855f7',
  [Verdict.INSUFFICIENT_EVIDENCE]: '#6b7280',
};

export interface EvidenceSignalInput {
  category: 'metadata' | 'hash' | 'compression' | 'provenance' | 'origin' | 'content';
  name: string;
  value: string;
  scoreImpact: number;
  details?: Record<string, unknown>;
}

export interface ScoringInput {
  hasExif: boolean;
  exifStripped: boolean;
  hasSoftwareTag: boolean;
  softwareTag?: string;
  hasTimestamp: boolean;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  perceptualHash?: string;
  duplicateFound: boolean;
  nearDuplicateFound: boolean;
  hasProvenanceSignature: boolean;
  sourceUrl?: string;
  platform?: string;
  isVideo: boolean;
  durationMs?: number;
  codec?: string;
  aiSuspicionScore?: number;
}

export interface ScoringOutput {
  verdict: Verdict;
  confidence: number;
  explanation: string;
  signals: EvidenceSignalInput[];
}
