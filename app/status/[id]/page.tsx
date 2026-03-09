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
  const [dots, setDots] = useState('');

  useEffect(() => {
    params.then(p => setJobId(p.id));
  }, [params]);

  useEffect(() => {
    const interval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
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

  const statusMessages: Record<string, string> = {
    queued: 'Queued for analysis',
    processing: 'Analyzing content',
    failed: 'Analysis failed',
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="font-mono text-xs text-zinc-600 uppercase tracking-widest">Soul</p>
        {job?.status === 'failed' ? (
          <>
            <p className="text-lg text-red-400 font-mono">Analysis failed</p>
            <p className="text-sm text-zinc-600 font-mono">{job.errorMessage}</p>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <div className="w-8 h-8 border border-zinc-700 border-t-white rounded-full animate-spin" />
            </div>
            <p className="text-sm font-mono text-zinc-400">
              {statusMessages[job?.status ?? 'queued'] ?? 'Processing'}{dots}
            </p>
            <p className="text-xs font-mono text-zinc-700">{jobId}</p>
          </>
        )}
      </div>
    </main>
  );
}
