import { SubmitForm } from '@/components/SubmitForm';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 md:px-12 py-5 flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-semibold tracking-[0.2em] uppercase">SOUL</span>
        <span className="text-xs text-zinc-600 tracking-widest uppercase font-mono">Verify</span>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col">
        <div className="max-w-7xl w-full mx-auto px-6 md:px-12 pt-16 md:pt-28 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">

            {/* Left: headline */}
            <div>
              <p className="text-xs font-mono text-zinc-600 tracking-[0.2em] uppercase mb-8">
                Content Verification
              </p>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-light tracking-tight leading-[1.05] mb-8 text-white">
                Real or<br />AI&#8209;generated?
              </h1>
              <p className="text-zinc-400 text-base md:text-lg font-light leading-relaxed max-w-sm">
                Submit any image or video. SOUL runs it through multiple independent detection layers and returns a verdict.
              </p>

              {/* Verdict pills */}
              <div className="mt-10 flex flex-wrap gap-2">
                {[
                  { label: 'Likely Original', color: '#22c55e' },
                  { label: 'Likely AI-Generated', color: '#a855f7' },
                  { label: 'Insufficient Evidence', color: '#52525b' },
                ].map(({ label, color }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono tracking-wider"
                    style={{ color, border: `1px solid ${color}30`, background: `${color}0d` }}
                  >
                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: form */}
            <div className="lg:pt-16">
              <SubmitForm />
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="border-t border-white/[0.06] mt-auto">
          <div className="max-w-7xl w-full mx-auto px-6 md:px-12 py-16 md:py-20">
            <p className="text-xs font-mono text-zinc-600 tracking-[0.2em] uppercase mb-10">How it works</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {[
                {
                  num: '01',
                  title: 'Submit content',
                  desc: 'Paste a link from Instagram, TikTok, Twitter/X, YouTube — or upload an image or video directly.',
                },
                {
                  num: '02',
                  title: 'Multi-layer analysis',
                  desc: 'SOUL runs the content through several independent detection methods simultaneously, including visual frame analysis.',
                },
                {
                  num: '03',
                  title: 'Get a verdict',
                  desc: 'Likely Original, Likely AI-Generated, or Insufficient Evidence — with the evidence and reasoning behind it.',
                },
              ].map(({ num, title, desc }) => (
                <div key={num} className="flex gap-5">
                  <span className="font-mono text-xs text-zinc-700 pt-1 flex-shrink-0 w-6">{num}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-200 mb-1.5">{title}</p>
                    <p className="text-xs font-mono text-zinc-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
