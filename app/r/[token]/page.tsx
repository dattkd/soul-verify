import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { VerdictBadge } from '@/components/VerdictBadge';
import { EvidenceTable } from '@/components/EvidenceTable';

interface ReportPageProps {
  params: Promise<{ token: string }>;
}

interface VisionDetails {
  reasoning?: string;
  signals?: string[];
}

interface HiveDetails {
  topSource?: string | null;
  allSources?: Record<string, number>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { token } = await params;

  const report = await prisma.publicReport.findUnique({
    where: { publicToken: token },
    include: {
      job: {
        include: {
          assets: { include: { derivedArtifacts: true } },
          analysisResult: true,
          evidenceSignals: true,
        },
      },
    },
  });

  if (!report || !report.isPublic) notFound();

  const { job } = report;
  const result = job.analysisResult;
  const asset = job.assets[0];
  const frames = asset?.derivedArtifacts.filter(a => a.type === 'frame') ?? [];

  // Extract detection signals
  const visionSignal = job.evidenceSignals.find(s => s.name === 'vision_ai_probability');
  const visionDetails = visionSignal?.detailsJson as VisionDetails | null;
  const visionProb = visionSignal ? Number(visionSignal.value) : null;

  const hiveSignal = job.evidenceSignals.find(s => s.name === 'hive_ai_probability');
  const hiveDetails = hiveSignal?.detailsJson as HiveDetails | null;
  const hiveProb = hiveSignal ? Number(hiveSignal.value) : null;

  const seSignal = job.evidenceSignals.find(s => s.name === 'sightengine_ai_probability');
  const seProb = seSignal ? Number(seSignal.value) : null;

  // Final displayed AI probability = max across all detectors
  const aiProb = Math.max(
    hiveProb ?? 0,
    seProb ?? 0,
    visionProb ?? 0,
  ) || null;

  // Non-detector signals for the evidence table
  const tableSignals = job.evidenceSignals.filter(
    s => !['vision_ai_probability', 'hive_ai_probability', 'sightengine_ai_probability', 'ai_probability'].includes(s.name),
  );

  const sourceHostname = (() => {
    try { return job.sourceUrl ? new URL(job.sourceUrl).hostname : '—'; }
    catch { return job.sourceUrl ?? '—'; }
  })();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <p className="font-mono text-xs text-zinc-600 uppercase tracking-widest">Soul / Report</p>
          <a
            href="/"
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white rounded transition-colors"
          >
            ↩ Verify Another
          </a>
        </div>

        {/* Verdict */}
        {result ? (
          <div className="mb-10">
            <VerdictBadge verdict={result.verdict} confidence={result.confidence} />
            <p className="mt-4 text-sm font-mono text-zinc-400 leading-relaxed max-w-lg">
              {result.explanation}
            </p>
          </div>
        ) : (
          <p className="text-sm font-mono text-zinc-500 mb-10">Report pending.</p>
        )}

        {/* AI Detection Analysis */}
        {aiProb !== null && (
          <section className="mb-10 border border-zinc-800 rounded p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">AI Detection</h2>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-3xl font-bold ${aiProb >= 55 ? 'text-red-400' : aiProb >= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {aiProb}%
                </span>
                <span className="font-mono text-xs text-zinc-600">AI probability</span>
              </div>
            </div>

            {/* Probability bar */}
            <div className="h-1.5 bg-zinc-900 rounded mb-5">
              <div
                className={`h-full rounded ${aiProb >= 55 ? 'bg-red-500' : aiProb >= 30 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${aiProb}%` }}
              />
            </div>

            {/* Sightengine — video-native detector */}
            {seProb !== null && (
              <div className="mb-4 pb-4 border-b border-zinc-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">Sightengine Video Analysis</span>
                  <span className={`font-mono text-sm font-bold ${seProb >= 55 ? 'text-red-400' : seProb >= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {seProb}%
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-600">Raw video file analyzed — not extracted frames</p>
              </div>
            )}

            {/* Hive — image fingerprint model */}
            {hiveProb !== null && (
              <div className="mb-4 pb-4 border-b border-zinc-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">Hive Image Detection</span>
                  <span className={`font-mono text-sm font-bold ${hiveProb >= 55 ? 'text-red-400' : hiveProb >= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {hiveProb}%
                  </span>
                </div>
                {hiveDetails?.topSource && hiveDetails.topSource !== 'none' && (
                  <p className="text-xs font-mono text-zinc-500">
                    Attributed to: <span className="text-zinc-300">{hiveDetails.topSource}</span>
                  </p>
                )}
              </div>
            )}

            {/* Claude vision reasoning */}
            {visionProb !== null && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">Claude Vision Analysis</span>
                  <span className={`font-mono text-sm font-bold ${visionProb >= 55 ? 'text-red-400' : visionProb >= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {visionProb}%
                  </span>
                </div>
                {visionDetails?.reasoning && (
                  <p className="text-sm font-mono text-zinc-400 leading-relaxed mb-3">
                    {visionDetails.reasoning}
                  </p>
                )}
                {visionDetails?.signals && visionDetails.signals.length > 0 && (
                  <ul className="space-y-1.5">
                    {visionDetails.signals.map((sig, i) => (
                      <li key={i} className="flex gap-3 text-xs font-mono text-zinc-500 leading-relaxed">
                        <span className="text-zinc-700 flex-shrink-0">·</span>
                        <span>{sig}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* Extracted frames */}
        {frames.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">
              Analyzed Frames ({frames.length})
            </h2>
            <div className="grid grid-cols-5 gap-2">
              {frames.map((frame, i) => (
                <div key={frame.id} className="bg-zinc-900 rounded overflow-hidden aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${frame.storageKey}`}
                    alt={`Frame ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Job metadata */}
        <div className="grid grid-cols-2 gap-px bg-zinc-900 rounded overflow-hidden mb-10">
          {[
            ['Status', job.status.toUpperCase()],
            ['Source', sourceHostname],
            ['Submitted', new Date(job.createdAt).toLocaleString()],
            ['Completed', job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'],
          ].map(([label, value]) => (
            <div key={label} className="bg-black p-4">
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-mono text-zinc-300 truncate">{value}</p>
            </div>
          ))}
        </div>

        {/* Asset metadata */}
        {asset && (
          <section className="mb-10">
            <h2 className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">Asset</h2>
            <div className="grid grid-cols-2 gap-px bg-zinc-900 rounded overflow-hidden">
              {[
                ['Type', asset.mimeType ?? '—'],
                ['Size', asset.sizeBytes ? `${(asset.sizeBytes / 1024).toFixed(1)} KB` : '—'],
                ['Dimensions', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'],
                ['Duration', asset.durationMs ? `${(asset.durationMs / 1000).toFixed(1)}s` : '—'],
                ['SHA-256', asset.sha256 ? asset.sha256.slice(0, 16) + '...' : '—'],
                ['Codec', asset.codec ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-black p-4">
                  <p className="text-xs font-mono text-zinc-600 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-mono text-zinc-300 truncate">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Other evidence signals */}
        {tableSignals.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">Evidence Signals</h2>
            <EvidenceTable signals={tableSignals as Parameters<typeof EvidenceTable>[0]['signals']} />
          </section>
        )}

        <div className="pt-8 border-t border-zinc-900">
          <p className="text-xs font-mono text-zinc-700">
            This report summarizes available evidence. It does not guarantee absolute truth.
            SOUL evaluates signals, not certainty.
          </p>
        </div>
      </div>
    </main>
  );
}
