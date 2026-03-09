export type ProvenanceStatus = 'not_found' | 'verified' | 'invalid';

export interface ProvenanceCheckResult {
  status: ProvenanceStatus;
  signer?: string;
  signatureType?: string;
  details?: Record<string, unknown>;
}

/**
 * Check whether a file buffer carries a Soul provenance signature.
 * V1: always returns not_found.
 * TODO: implement C2PA / XMP Soul signature extraction and Ed25519 verification.
 */
export async function checkProvenance(_buffer: Buffer, _mimeType: string): Promise<ProvenanceCheckResult> {
  return { status: 'not_found' };
}
