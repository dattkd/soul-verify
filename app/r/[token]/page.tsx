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

interface AiOrNotImageDetails {
  isDeepfake?: boolean;
  detectedGenerator?: string | null;
  generatorConfidence?: number;
}

interface AiOrNotVideoDetails {
  aiVideoProbability?: number;
  aiVoiceProbability?: number;
  isDeepfake?: boolean;
  deepfakeConfidence?: number;
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

  const visionSignal = job.evidenceSignals.find(s => s.name === 'vision_ai_probability');
  const visionDetails = visionSignal?.detailsJson as VisionDetails | null;
  const visionProb = visionSignal ? Number(visionSignal.value) : null;

  const hiveSignal = job.evidenceSignals.find(s => s.name === 'hive_ai_probability');
  const hiveDetails = hiveSignal?.detailsJson as HiveDetails | null;
  const hiveProb = hiveSignal ? Number(hiveSignal.value) : null;

  const seSignal = job.evidenceSignals.find(s => s.name === 'sightengine_ai_probability');
  const seProb = seSignal ? Number(seSignal.value) : null;

  const aiOrNotSignal = job.evidenceSignals.find(s => s.name === 'aiornot_ai_probability');
  const aiOrNotProb = aiOrNotSignal ? Number(aiOrNotSignal.value) : null;
  const aiOrNotDetails = aiOrNotSignal?.detailsJson as (AiOrNotImageDetails & AiOrNotVideoDetails) | null;

  const aiProb = Math.max(hiveProb ?? 0, seProb ?? 0, visionProb ?? 0, aiOrNotProb ?? 0) || null;

  const tableSignals = job.evidenceSignals.filter(
    s => !['vision_ai_probability', 'hive_ai_probability', 'sightengine_ai_probability', 'ai_probability', 'aiornot_ai_probability'].includes(s.name),
  );

  const sourceHostname = (() => {
    try { return job.sourceUrl ? new URL(job.sourceUrl).hostname : '—'; }
    catch { return job.sourceUrl ?? '—'; }
  })();

  const aiColor = aiProb !== null
    ? aiProb >= 65 ? '#f87171' : aiProb >= 35 ? '#facc15' : '#4ade80'
    : '#52525b';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 md:px-12 py-5 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.2em] uppercase">SOUL</span>
        <a
          href="/"
          className="text-xs font-mono uppercase tracking-widest px-4 py-2 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white rounded-full transition-colors"
        >
          ↩ Verify Another
        </a>
      </nav>

      <div className="max-w-7xl w-full mx-auto px-6 md:px-12 py-12 md:py-16">

        {/* Verdict */}
        {result ? (
          <div className="mb-12 pb-12 border-b border-white/[0.06]">
            <VerdictBadge verdict={result.verdict} confidence={result.confidence} />
            <p className="mt-5 text-sm text-zinc-400 leading-relaxed max-w-2xl font-light">
              {result.explanation}
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 mb-12">Report pending.</p>
        )}

        {/* Main content grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">

          {/* Left col: AI Detection (2/3 width) */}
          <div className="xl:col-span-2 space-y-6">

            {/* AI Detection block */}
            {aiProb !== null && (
              <div className="border border-white/[0.06] rounded-xl p-6 md:p-8">
                <div className="flex items-start justify-between mb-6">
                  <h2 className="text-xs font-mono text-zinc-500 tracking-[0.2em] uppercase">AI Detection</h2>
                  <div className="text-right">
                    <span className="font-mono text-4xl font-bold tabular-nums" style={{ color: aiColor }}>
                      {aiProb}%
                    </span>
                    <p className="text-xs font-mono text-zinc-600 mt-0.5">AI probability</p>
                  </div>
                </div>

                {/* Bar */}
                <div className="h-1 bg-zinc-900 rounded-full mb-8">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${aiProb}%`, background: aiColor }}
                  />
                </div>

                <div className="space-y-6">
                  {/* Visual Analysis (was Claude vision) */}
                  {visionProb !== null && (
                    <div className="pt-6 border-t border-white/[0.04]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono text-zinc-500 tracking-[0.15em] uppercase">Visual Analysis</span>
                        <span className="font-mono text-sm font-bold tabular-nums" style={{ color: visionProb >= 65 ? '#f87171' : visionProb >= 35 ? '#facc15' : '#4ade80' }}>
                          {visionProb}%
                        </span>
                      </div>
                      {visionDetails?.reasoning && (
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4 font-light">
                          {visionDetails.reasoning}
                        </p>
                      )}
                      {visionDetails?.signals && visionDetails.signals.length > 0 && (
                        <ul className="space-y-2">
                          {visionDetails.signals.map((sig, i) => (
                            <li key={i} className="flex gap-3 text-xs font-mono text-zinc-500 leading-relaxed">
                              <span className="text-zinc-700 flex-shrink-0 mt-0.5">·</span>
                              <span>{sig}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Temporal Analysis (was Sightengine) */}
                  {seProb !== null && (
                    <div className="pt-6 border-t border-white/[0.04]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono text-zinc-500 tracking-[0.15em] uppercase">Temporal Analysis</span>
                        <span className="font-mono text-sm font-bold tabular-nums" style={{ color: seProb >= 65 ? '#f87171' : seProb >= 35 ? '#facc15' : '#4ade80' }}>
                          {seProb}%
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-600">Frame-by-frame motion pattern analysis</p>
                    </div>
                  )}

                  {/* Trained Detector (AI or Not) — primary accuracy engine */}
                  {aiOrNotProb !== null && (
                    <div className="pt-6 border-t border-white/[0.04]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-zinc-500 tracking-[0.15em] uppercase">Trained Detector</span>
                        <span className="font-mono text-sm font-bold tabular-nums" style={{ color: aiOrNotProb >= 65 ? '#f87171' : aiOrNotProb >= 35 ? '#facc15' : '#4ade80' }}>
                          {aiOrNotProb}%
                        </span>
                      </div>
                      {aiOrNotDetails?.detectedGenerator && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs font-mono text-zinc-600">Generator identified:</span>
                          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full border border-purple-500/30 text-purple-300 bg-purple-500/10">
                            {aiOrNotDetails.detectedGenerator}
                            {aiOrNotDetails.generatorConfidence ? ` · ${aiOrNotDetails.generatorConfidence}%` : ''}
                          </span>
                        </div>
                      )}
                      {(aiOrNotDetails?.isDeepfake || aiOrNotDetails?.deepfakeConfidence) && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full border border-red-500/30 text-red-300 bg-red-500/10">
                            Deepfake detected{aiOrNotDetails.deepfakeConfidence ? ` · ${aiOrNotDetails.deepfakeConfidence}%` : ''}
                          </span>
                        </div>
                      )}
                      {aiOrNotDetails?.aiVoiceProbability !== undefined && aiOrNotDetails.aiVoiceProbability > 20 && (
                        <p className="text-xs font-mono text-zinc-600 mt-1.5">
                          AI voice: <span className="text-zinc-400">{aiOrNotDetails.aiVoiceProbability}%</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Pattern Detection (Hive) */}
                  {hiveProb !== null && (
                    <div className="pt-6 border-t border-white/[0.04]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono text-zinc-500 tracking-[0.15em] uppercase">Pattern Detection</span>
                        <span className="font-mono text-sm font-bold tabular-nums" style={{ color: hiveProb >= 65 ? '#f87171' : hiveProb >= 35 ? '#facc15' : '#4ade80' }}>
                          {hiveProb}%
                        </span>
                      </div>
                      {hiveDetails?.topSource && hiveDetails.topSource !== 'none' && (
                        <p className="text-xs font-mono text-zinc-500 mt-1">
                          Source: <span className="text-zinc-300">{hiveDetails.topSource}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Evidence signals */}
            {tableSignals.length > 0 && (
              <div className="border border-white/[0.06] rounded-xl p-6 md:p-8">
                <h2 className="text-xs font-mono text-zinc-500 tracking-[0.2em] uppercase mb-5">Evidence Signals</h2>
                <EvidenceTable signals={tableSignals as Parameters<typeof EvidenceTable>[0]['signals']} />
              </div>
            )}
          </div>

          {/* Right col: metadata (1/3 width) */}
          <div className="space-y-4">
            <div className="border border-white/[0.06] rounded-xl p-6">
              <h2 className="text-xs font-mono text-zinc-500 tracking-[0.2em] uppercase mb-5">Submission</h2>
              <div className="space-y-4">
                {[
                  ['Status', job.status.toUpperCase()],
                  ['Source', sourceHostname],
                  ['Submitted', new Date(job.createdAt).toLocaleString()],
                  ['Completed', job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-mono text-zinc-600 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm text-zinc-300 truncate">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {asset && (
              <div className="border border-white/[0.06] rounded-xl p-6">
                <h2 className="text-xs font-mono text-zinc-500 tracking-[0.2em] uppercase mb-5">File</h2>
                <div className="space-y-4">
                  {[
                    ['Type', asset.mimeType ?? '—'],
                    ['Size', asset.sizeBytes ? `${(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB` : '—'],
                    ['Dimensions', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'],
                    ['Duration', asset.durationMs ? `${(asset.durationMs / 1000).toFixed(1)}s` : '—'],
                    ['Hash', asset.sha256 ? asset.sha256.slice(0, 12) + '…' : '—'],
                    ['Codec', asset.codec ?? '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs font-mono text-zinc-600 uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-sm font-mono text-zinc-300 truncate">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs font-mono text-zinc-700 px-1 leading-relaxed">
              This report summarizes available evidence. SOUL evaluates signals, not certainty.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
