import crypto from 'crypto';
import type { ProviderAdapter, MentionEvent } from './types';

const GRAPH_BASE = 'https://graph.instagram.com/v21.0';

/**
 * Instagram provider adapter — Instagram API with Instagram Login (business/creator accounts).
 *
 * Webhook fields to subscribe: `mentions`, `comments`
 * Required token scopes: instagram_business_manage_comments, instagram_business_basic
 *
 * Env vars:
 *   INSTAGRAM_WEBHOOK_SECRET  — set in Meta App Dashboard → Webhooks
 *   INSTAGRAM_ACCESS_TOKEN    — long-lived User/Page token for your @soul account
 *   INSTAGRAM_ACCOUNT_ID      — numeric ID of your @soul Instagram business account
 */
export class InstagramProvider implements ProviderAdapter {
  name = 'instagram';

  parseWebhookEvent(payload: unknown, _headers: Record<string, string>): MentionEvent | null {
    try {
      const body = payload as {
        object?: string;
        entry?: Array<{
          id?: string;
          time?: number;
          changes?: Array<{
            field?: string;
            value?: {
              // mentions field
              comment_id?: string;
              media_id?: string;
              // comments field
              id?: string;
              text?: string;
              from?: { id?: string; username?: string };
              media?: { id?: string };
            };
          }>;
        }>;
      };

      if (body.object !== 'instagram') return null;

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const val = change.value;
          if (!val) continue;

          // ── mentions field ───────────────────────────────────────────────
          // Fires when someone @-mentions our account in a caption or comment
          if (change.field === 'mentions') {
            const commentId = val.comment_id;
            const mediaId = val.media_id;
            // replyTargetId: prefer comment reply, fall back to media comment
            const replyTargetId = commentId ? `comment:${commentId}` : mediaId ? `media:${mediaId}` : undefined;
            return {
              provider: 'instagram',
              externalEventId: `${entry.id}-${entry.time ?? Date.now()}`,
              mentionHandle: '@thesoulcompanyinc',
              authorHandle: entry.id ?? 'unknown', // we only get account ID here; username resolved on reply
              referencedPostId: commentId ?? mediaId,
              referencedMediaUrl: undefined, // fetched async by webhook handler
              rawPayload: payload as Record<string, unknown>,
              timestamp: entry.time ? new Date(entry.time * 1000) : new Date(),
              // Pass the reply target through the referencedPostId field
              // Format: "comment:{id}" or "media:{id}"
              replyTargetId,
            };
          }

          // ── comments field ───────────────────────────────────────────────
          // Fires on all comments on our media; filter for @soul mentions
          if (change.field === 'comments' && val.text?.toLowerCase().includes('@thesoulcompanyinc')) {
            const commentId = val.id;
            const mediaId = val.media?.id;
            return {
              provider: 'instagram',
              externalEventId: commentId ?? `${entry.id}-${Date.now()}`,
              mentionHandle: '@thesoulcompanyinc',
              authorHandle: val.from?.username ?? val.from?.id ?? 'unknown',
              referencedPostId: mediaId ?? commentId,
              referencedMediaUrl: undefined,
              rawPayload: payload as Record<string, unknown>,
              timestamp: new Date(),
              replyTargetId: commentId ? `comment:${commentId}` : mediaId ? `media:${mediaId}` : undefined,
            };
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  verifySignature(payload: string, headers: Record<string, string>): boolean {
    const secret = process.env.INSTAGRAM_WEBHOOK_SECRET;
    if (!secret) return true; // No secret configured — allow in dev/mock mode
    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  formatReply(verdict: string, confidence: number, reportUrl: string): string {
    return `SOUL verified this content.\n\nVerdict: ${verdict}\nConfidence: ${confidence}/100\n\nFull report: ${reportUrl}`;
  }

  /**
   * Post a reply via Instagram Graph API.
   * replyTargetId format:
   *   "comment:{comment_id}"  → reply to that comment
   *   "media:{media_id}"      → post a top-level comment on that media
   */
  async postReply(_authorHandle: string, replyText: string, replyTargetId?: string): Promise<boolean> {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!token) {
      console.log('[instagram] INSTAGRAM_ACCESS_TOKEN not set — mock reply:', replyText);
      return true;
    }

    if (!replyTargetId) {
      console.warn('[instagram] No replyTargetId — cannot post reply');
      return false;
    }

    try {
      const [type, id] = replyTargetId.split(':');

      let url: string;
      if (type === 'comment') {
        // Reply to a specific comment
        url = `${GRAPH_BASE}/${id}/replies`;
      } else if (type === 'media') {
        // Post a top-level comment on media
        url = `${GRAPH_BASE}/${id}/comments`;
      } else {
        console.warn('[instagram] Unknown replyTargetId format:', replyTargetId);
        return false;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText, access_token: token }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[instagram] Reply failed:', err);
        return false;
      }

      const data = await res.json() as { id?: string };
      console.log('[instagram] Reply posted:', data.id);
      return true;
    } catch (err) {
      console.error('[instagram] postReply error:', err);
      return false;
    }
  }

  /**
   * Fetch the media URL for a given media_id using the Graph API.
   * Used by the webhook handler to populate sourceUrl on a mention job.
   */
  async fetchMediaUrl(mediaId: string): Promise<string | undefined> {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!token) return undefined;
    try {
      const res = await fetch(
        `${GRAPH_BASE}/${mediaId}?fields=media_url,thumbnail_url&access_token=${token}`,
      );
      if (!res.ok) return undefined;
      const data = await res.json() as { media_url?: string; thumbnail_url?: string };
      return data.media_url ?? data.thumbnail_url;
    } catch {
      return undefined;
    }
  }
}
