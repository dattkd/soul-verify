interface Signal {
  id: string;
  category: string;
  name: string;
  value: string;
  scoreImpact: number;
  detailsJson: unknown;
}

interface Props {
  signals: Signal[];
}

function impactColor(impact: number): string {
  if (impact > 0) return 'text-green-400';
  if (impact < 0) return 'text-red-400';
  return 'text-zinc-500';
}

export function EvidenceTable({ signals }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-widest">
            <th className="text-left py-2 pr-4">Category</th>
            <th className="text-left py-2 pr-4">Signal</th>
            <th className="text-left py-2 pr-4">Value</th>
            <th className="text-right py-2">Impact</th>
          </tr>
        </thead>
        <tbody>
          {signals.map(sig => (
            <tr key={sig.id} className="border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors">
              <td className="py-2 pr-4 text-zinc-500 uppercase text-xs tracking-wider">{sig.category}</td>
              <td className="py-2 pr-4 text-zinc-300">{sig.name.replace(/_/g, ' ')}</td>
              <td className="py-2 pr-4 text-zinc-400 max-w-xs truncate">{sig.value}</td>
              <td className={`py-2 text-right ${impactColor(sig.scoreImpact)}`}>
                {sig.scoreImpact > 0 ? '+' : ''}{sig.scoreImpact}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
