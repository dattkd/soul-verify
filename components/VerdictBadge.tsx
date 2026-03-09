import { Verdict, VERDICT_LABELS, VERDICT_COLORS } from '@/lib/scoring/types';

interface Props {
  verdict: string;
  confidence: number;
}

export function VerdictBadge({ verdict, confidence }: Props) {
  const label = VERDICT_LABELS[verdict as Verdict] ?? verdict;
  const color = VERDICT_COLORS[verdict as Verdict] ?? '#6b7280';

  return (
    <div className="flex items-center gap-4">
      <span
        className="inline-block px-3 py-1 rounded-full text-sm font-mono font-medium tracking-widest uppercase"
        style={{ color, border: `1px solid ${color}`, background: `${color}12` }}
      >
        {label}
      </span>
      <span className="font-mono text-sm text-zinc-400">
        {confidence}<span className="text-zinc-600">/100</span>
      </span>
    </div>
  );
}
