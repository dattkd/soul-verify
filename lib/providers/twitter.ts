import crypto from 'crypto';
import type { ProviderAdapter, MentionEvent } from './types';

/**
 * X (Twitter) provider adapter — Account Activity API.
 * TODO: apply for Elevated access at developer.twitter.com
 * TODO: set TWITTER_WEBHOOK_SECRET env var (used for CRC token + signature)
 * TODO: implement postReply — POST https://api.twitter.com/2/tweets
 */
export class TwitterProvider implements ProviderAdapter {
  name = 'twitter';

  parseWebhookEvent(payload: unknown, _headers: Record<string, string>): MentionEvent | null {
    try {
      const body = payload as {
        tweet_create_events?: Array<{
          id_str?: string;
          text?: string;
          user?: { screen_name?: string };
          timestamp_ms?: string;
          entities?: { urls?: Array<{ expanded_url?: string }> };
        }>;
      };
      for (const tweet of body.tweet_create_events ?? []) {
        if (!tweet.text?.includes('@soul')) continue;
        return {
          provider: 'twitter',
          externalEventId: tweet.id_str ?? '',
          mentionHandle: '@soul',
          authorHandle: tweet.user?.screen_name ?? 'unknown',
          referencedMediaUrl: tweet.entities?.urls?.[0]?.expanded_url,
          rawPayload: payload as Record<string, unknown>,
          timestamp: tweet.timestamp_ms ? new Date(parseInt(tweet.timestamp_ms)) : new Date(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  verifySignature(payload: string, headers: Record<string, string>): boolean {
    const secret = process.env.TWITTER_WEBHOOK_SECRET;
    if (!secret) return true;
    const signature = headers['x-twitter-webhooks-signature'];
    if (!signature) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  formatReply(verdict: string, confidence: number, reportUrl: string): string {
    return `SOUL verified: ${verdict} (${confidence}/100)\n${reportUrl}`;
  }

  async postReply(_authorHandle: string, replyText: string, _referencedPostId?: string): Promise<boolean> {
    console.log(`[twitter] MOCK reply: ${replyText}`);
    return true;
  }
}
