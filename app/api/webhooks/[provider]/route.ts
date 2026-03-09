import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getProvider } from '@/lib/providers';
import { InstagramProvider } from '@/lib/providers/instagram';
import { enqueueVerification } from '@/lib/queue';

// Webhook challenge verification (GET) — used by Meta and Twitter
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerName } = await params;
  const url = new URL(req.url);

  // Meta hub.challenge (Instagram, Threads)
  const challenge = url.searchParams.get('hub.challenge');
  const mode = url.searchParams.get('hub.mode');
  if (mode === 'subscribe' && challenge) return new Response(challenge, { status: 200 });

  // Twitter CRC
  const crcToken = url.searchParams.get('crc_token');
  if (crcToken && providerName === 'twitter') {
    const { createHmac } = await import('crypto');
    const secret = process.env.TWITTER_WEBHOOK_SECRET ?? '';
    const hash = createHmac('sha256', secret).update(crcToken).digest('base64');
    return NextResponse.json({ response_token: `sha256=${hash}` });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerName } = await params;
  const provider = getProvider(providerName);
  if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  // Verify HMAC signature
  if (!provider.verifySignature(rawBody, headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const event = provider.parseWebhookEvent(payload, headers);
  if (!event) return NextResponse.json({ ok: true, skipped: true });

  // ── For Instagram: try to resolve the media URL from the media_id ────────
  let sourceUrl = event.referencedMediaUrl;
  if (!sourceUrl && providerName === 'instagram' && event.referencedPostId) {
    const igProvider = provider as InstagramProvider;
    const mediaId = event.referencedPostId.replace(/^(comment|media):/, '');
    sourceUrl = await igProvider.fetchMediaUrl(mediaId);
  }

  // Store the raw platform event
  const platformEvent = await prisma.platformEvent.create({
    data: {
      provider: event.provider,
      eventType: 'mention',
      rawPayload: event.rawPayload as object,
      externalEventId: event.externalEventId,
    },
  });

  // Create the verification job
  const job = await prisma.verificationJob.create({
    data: {
      inputType: 'mention',
      sourceUrl: sourceUrl ?? null,
      platform: event.provider,
      requestedByProvider: event.provider,
      requestedByHandle: event.authorHandle,
      // Store replyTargetId in canonicalUrl for now (no schema change needed)
      canonicalUrl: event.replyTargetId ?? null,
      status: 'queued',
      platformEvents: { connect: { id: platformEvent.id } },
    },
  });

  // Enqueue — pass reply metadata so the worker can post back
  await enqueueVerification({
    jobId: job.id,
    sourceUrl,
    requestedByProvider: event.provider,
    requestedByHandle: event.authorHandle,
    replyTargetId: event.replyTargetId,
  });

  await prisma.platformEvent.update({
    where: { id: platformEvent.id },
    data: { processedAt: new Date(), jobId: job.id },
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}
