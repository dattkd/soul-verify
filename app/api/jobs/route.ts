import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { enqueueVerification } from '@/lib/queue';
import { getStorage, generateStorageKey } from '@/lib/storage';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let sourceUrl: string | undefined;
    let mimeType: string | undefined;
    let originalFilename: string | undefined;
    let fileBuffer: Buffer | undefined;
    let platform: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      sourceUrl = (formData.get('url') as string | null) ?? undefined;
      platform = (formData.get('platform') as string | null) ?? undefined;
      const file = formData.get('file') as File | null;
      if (file) {
        fileBuffer = Buffer.from(await file.arrayBuffer());
        mimeType = file.type;
        originalFilename = file.name;
      }
    } else {
      const body = await req.json();
      sourceUrl = body.url;
      platform = body.platform;
    }

    if (!sourceUrl && !fileBuffer) {
      return NextResponse.json({ error: 'Provide either a URL or a file upload' }, { status: 400 });
    }

    const inputType = fileBuffer ? 'upload' : 'url';
    const job = await prisma.verificationJob.create({
      data: { inputType, sourceUrl: sourceUrl ?? null, platform: platform ?? null, status: 'queued' },
    });

    let storageKey: string | undefined;
    if (fileBuffer) {
      const ext = originalFilename ? path.extname(originalFilename) : '.bin';
      storageKey = generateStorageKey('uploads', ext);
      await getStorage().put(storageKey, fileBuffer, mimeType);
    }

    await enqueueVerification({ jobId: job.id, sourceUrl, mimeType, originalFilename, storageKey });

    return NextResponse.json({ jobId: job.id, status: 'queued' }, { status: 201 });
  } catch (err) {
    console.error('[api/jobs] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
