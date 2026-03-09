import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await prisma.verificationJob.findUnique({
    where: { id },
    include: {
      assets: { include: { derivedArtifacts: true, provenanceRecord: true } },
      analysisResult: true,
      evidenceSignals: true,
      publicReport: true,
    },
  });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(job);
}
