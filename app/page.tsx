import { SubmitForm } from '@/components/SubmitForm';

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-xl mx-auto px-6 py-24">
        <div className="mb-16">
          <p className="font-mono text-xs tracking-widest uppercase text-zinc-500 mb-6">Soul</p>
          <h1 className="text-4xl font-light tracking-tight text-white leading-tight mb-4">
            Is this real<br />or AI-generated?
          </h1>
          <p className="text-sm font-mono text-zinc-500 leading-relaxed">
            Paste any link or upload a file. SOUL runs it through a<br />
            specialized AI detection model and returns a verdict.
          </p>
        </div>

        <SubmitForm />

        <div className="mt-20 pt-12 border-t border-zinc-900">
          <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-6">How it works</p>
          <div className="space-y-4">
            {[
              ['01', 'Paste a link or upload', 'Instagram, TikTok, Twitter/X, YouTube, or any direct image or video file.'],
              ['02', 'Two AI models analyze it', 'Hive\'s specialist detection model + Claude vision run in parallel on every frame.'],
              ['03', 'Get a verdict', 'Likely Original, Likely AI-Generated, or Insufficient Evidence — with the reasoning.'],
            ].map(([num, title, desc]) => (
              <div key={num} className="flex gap-4">
                <span className="font-mono text-xs text-zinc-700 pt-0.5 w-6 flex-shrink-0">{num}</span>
                <div>
                  <p className="text-sm text-zinc-300 font-medium">{title}</p>
                  <p className="text-xs font-mono text-zinc-600 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-900">
          <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">Possible verdicts</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Likely Original', color: '#22c55e' },
              { label: 'Likely AI-Generated', color: '#a855f7' },
              { label: 'Manipulated / Edited', color: '#ef4444' },
              { label: 'Insufficient Evidence', color: '#6b7280' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-xs font-mono text-zinc-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
