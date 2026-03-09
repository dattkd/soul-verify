'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface JobStatus {
  id: string;
  status: string;
  publicReport?: { publicToken: string };
  errorMessage?: string;
}

export default function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    params.then(p => setJobId(p.id));
  }, [params]);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        setJob(data);
        if (data.status === 'completed' && data.publicReport) {
          router.replace(`/r/${data.publicReport.publicToken}`);
        }
      } catch { /* retry */ }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [jobId, router]);

  const steps = [
    { label: 'Downloading content', done: elapsed >= 2 },
    { label: 'Extracting frames', done: elapsed >= 4 },
    { label: 'Running detection', done: elapsed >= 6 },
    { label: 'Computing verdict', done: job?.status === 'completed' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <nav className="border-b border-white/[0.06] px-6 md:px-12 py-5">
        <span className="text-sm font-semibold tracking-[0.2em] uppercase">SOUL</span>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6">
        {job?.status === 'failed' ? (
          <div className="text-center max-w-md">
            <p className="text-xs font-mono text-zinc-600 tracking-widest uppercase mb-4">Analysis Failed</p>
            <p className="text-sm text-zinc-400 leading-relaxed">{job.errorMessage ?? 'An error occurred during analysis.'}</p>
            <a href="/" className="mt-8 inline-block text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
              ← Try again
            </a>
          </div>
        ) : (
          <div className="w-full max-w-xs">
            <p className="text-xs font-mono text-zinc-600 tracking-[0.2em] uppercase mb-10 text-center">Analyzing</p>

            <div className="space-y-4 mb-10">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-500 ${
                    step.done ? 'bg-white' : 'bg-zinc-800'
                  }`} />
                  <span className={`text-xs font-mono tracking-wider transition-colors duration-500 ${
                    step.done ? 'text-zinc-300' : 'text-zinc-700'
                  }`}>
                    {step.label}
                  </span>
                  {step.done && (
                    <span className="ml-auto text-xs font-mono text-zinc-600">✓</span>
                  )}
                </div>
              ))}
            </div>

            <div className="h-px bg-zinc-900 rounded overflow-hidden">
              <div
                className="h-full bg-white/20 transition-all duration-1000"
                style={{ width: `${Math.min(95, elapsed * 8)}%` }}
              />
            </div>
            <p className="text-xs font-mono text-zinc-700 mt-3 text-center">{elapsed}s elapsed</p>
          </div>
        )}
      </div>
    </div>
  );
}
