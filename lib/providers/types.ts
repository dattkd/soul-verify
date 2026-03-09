export interface MentionEvent {
  provider: string;
  externalEventId: string;
  mentionHandle: string;
  authorHandle: string;
  referencedPostId?: string;
  referencedMediaUrl?: string;
  rawPayload: Record<string, unknown>;
  timestamp: Date;
  /** Format: "comment:{id}" or "media:{id}" — used to target the reply */
  replyTargetId?: string;
}

export interface VerificationRequest {
  inputType: 'mention';
  sourceUrl?: string;
  platform: string;
  requestedByProvider: string;
  requestedByHandle: string;
  platformEventId: string;
}

export interface BotReply {
  text: string;
  reportUrl: string;
}

export interface ProviderAdapter {
  name: string;
  parseWebhookEvent(payload: unknown, headers: Record<string, string>): MentionEvent | null;
  verifySignature(payload: string, headers: Record<string, string>): boolean;
  formatReply(verdict: string, confidence: number, reportUrl: string): string;
  postReply(authorHandle: string, replyText: string, replyTargetId?: string): Promise<boolean>;
}
