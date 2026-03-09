import crypto from 'crypto';
import type { ProviderAdapter, MentionEvent } from './types';

/**
 * Threads provider adapter.
 * TODO: register webhook at developers.facebook.com → Threads → Webhooks
 * TODO: set THREADS_WEBHOOK_SECRET env var
 * TODO: implement postReply with Threads Reply API
 *   POST https://graph.threads.net/v1.0/me/threads
 *   Authorization: Bearer {THREADS_ACCESS_TOKEN}
 */
export class ThreadsProvider implements ProviderAdapter {
  name = 'threads';

  parseWebhookEvent(payload: unknown, _headers: Record<string, string>): MentionEvent | null {
    try {
      const body = payload as {
        object?: string;
        entry?: Array<{
          id: string;
          changes?: Array<{
            value?: { text?: string; from?: { username?: string }; id?: string; timestamp?: number; media_id?: string };
          }>;
        }>;
      };
      if (body.object !== 'instagram') return null;
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const val = change.value;
          if (!val?.text?.includes('@soul')) continue;
          return {
            provider: 'threads',
            externalEventId: val.id ?? entry.id,
            mentionHandle: '@soul',
            authorHandle: val.from?.username ?? 'unknown',
            referencedPostId: val.media_id,
            referencedMediaUrl: undefined,
            rawPayload: payload as Record<string, unknown>,
            timestamp: val.timestamp ? new Date(val.timestamp * 1000) : new Date(),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  verifySignature(payload: string, headers: Record<string, string>): boolean {
    const secret = process.env.THREADS_WEBHOOK_SECRET;
    if (!secret) return true;
    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  formatReply(verdict: string, confidence: number, reportUrl: string): string {
    return `SOUL verified this content.\n\nVerdict: ${verdict}\nConfidence: ${confidence}/100\n\nFull report: ${reportUrl}`;
  }

  async postReply(_authorHandle: string, replyText: string, _referencedPostId?: string): Promise<boolean> {
    console.log(`[threads] MOCK reply: ${replyText}`);
    return true;
  }
}
