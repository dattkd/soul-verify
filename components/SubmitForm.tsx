'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export function SubmitForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url && !file) { setError('Provide a URL or upload a file.'); return; }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      if (url) formData.append('url', url);
      if (file) formData.append('file', file);
      const res = await fetch('/api/jobs', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Submission failed.'); return; }
      router.push(`/status/${data.jobId}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
          Source URL
        </label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-4 py-3 text-sm font-mono text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      <div className="flex items-center gap-3 text-zinc-700">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-xs font-mono uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-zinc-500 bg-zinc-900' : 'border-zinc-800 hover:border-zinc-700'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="text-sm font-mono text-zinc-300">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-mono text-zinc-500">Drop an image or video</p>
            <p className="text-xs font-mono text-zinc-700 mt-1">or click to browse</p>
          </>
        )}
      </div>

      {error && <p className="text-xs font-mono text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-white text-black font-mono text-sm uppercase tracking-widest py-3 rounded hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Submitting...' : 'Verify'}
      </button>
    </form>
  );
}
