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

const SIGNAL_LABELS: Record<string, string> = {
  exif_present: 'Original camera metadata intact',
  exif_stripped: 'Camera metadata stripped',
  near_duplicate: 'Similar content previously seen',
  seen_before: 'Exact content seen before',
  software_tag: 'Software tag in metadata',
  short_duration: 'Unusually short clip',
  exact_duration: 'Suspiciously exact duration',
  small_file: 'Unusually small file size',
  no_audio: 'No audio track',
  low_resolution: 'Low resolution for claimed source',
};

function formatValue(name: string, value: string): string {
  if (value.startsWith('weight:')) return '';
  if (name === 'exif_present') return 'Yes';
  if (name === 'exif_stripped') return 'Yes';
  if (name === 'seen_before') return 'Duplicate';
  if (name === 'near_duplicate') return 'Near match';
  return value;
}

export function EvidenceTable({ signals }: Props) {
  if (signals.length === 0) return null;

  return (
    <div className="space-y-2">
      {signals.map(sig => {
        const label = SIGNAL_LABELS[sig.name] ?? sig.name.replace(/_/g, ' ');
        const value = formatValue(sig.name, sig.value);
        const impact = sig.scoreImpact;

        return (
          <div key={sig.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
            <span className="text-sm text-zinc-300">{label}</span>
            <div className="flex items-center gap-3">
              {value && <span className="text-xs font-mono text-zinc-500">{value}</span>}
              {impact !== 0 && (
                <span className={`text-xs font-mono font-medium ${impact > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {impact > 0 ? '+' : ''}{impact}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
