import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const report = await prisma.publicReport.findUnique({
    where: { publicToken: token },
    include: {
      job: {
        include: {
          assets: { include: { derivedArtifacts: true, provenanceRecord: true } },
          analysisResult: true,
          evidenceSignals: true,
        },
      },
    },
  });
  if (!report || !report.isPublic) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  return NextResponse.json(report);
}
