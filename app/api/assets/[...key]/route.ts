import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const storageKey = key.join('/');

  try {
    const storage = getStorage();
    const buffer = await storage.get(storageKey);

    // Infer content type from extension
    const ext = storageKey.split('.').pop()?.toLowerCase() ?? '';
    const contentType =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'mp4' ? 'video/mp4' :
      'application/octet-stream';

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
