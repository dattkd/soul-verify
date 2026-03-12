/**
 * Soul ID — Public identity verification page.
 *
 * Reached by scanning the QR code on the Soul app, or by clicking a
 * soulverified.com/v/[soul_number] link shared online.
 *
 * Answers two questions:
 *   1. Is this a real human? (Soul Score + signals)
 *   2. Who is behind this account? (name, handle, verified platforms)
 */

import { Metadata } from 'next';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifyResult {
  valid:               boolean;
  reason?:             string | null;
  error?:              string;
  soul_number?:        string;
  display_name?:       string;
  username?:           string;
  city?:               string;
  human_score?:        number;
  tier?:               string;
  signals?: {
    encounters_total:   number;
    unique_humans_met:  number;
    months_active:      number;
    verified_platforms: number;
  };
  verified_accounts?: { platform: string; handle: string }[];
  issued_at?:          string;
  expires_at?:         string;
  verification_count?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.SOUL_APP_SUPABASE_URL      ?? '';
const SUPABASE_ANON = process.env.SOUL_APP_SUPABASE_ANON_KEY ?? '';

const TIER_COLORS: Record<string, string> = {
  Sun:   '#F59E0B',
  Ember: '#F97316',
  Pulse: '#EC4899',
  Sky:   '#3B82F6',
  Frost: '#06B6D4',
};

const PLATFORM_LABELS: Record<string, string> = {
  twitter:   'X / Twitter',
  instagram: 'Instagram',
  reddit:    'Reddit',
  spotify:   'Spotify',
  github:    'GitHub',
  linkedin:  'LinkedIn',
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchIdentity(soulNumber: string): Promise<VerifyResult> {
  if (!SUPABASE_URL) return { valid: false, error: 'Verification service not configured.' };

  try {
    const url = `${SUPABASE_URL}/functions/v1/verify-public?soul_number=${encodeURIComponent(soulNumber)}`;
    const res = await fetch(url, {
      headers: {
        apikey:        SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      next: { revalidate: 60 },
    });
    return res.json() as Promise<VerifyResult>;
  } catch {
    return { valid: false, error: 'Could not reach verification service.' };
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ soulNumber: string }>;
}): Promise<Metadata> {
  const { soulNumber } = await params;
  const result = await fetchIdentity(soulNumber.toUpperCase());

  const name  = result.display_name ?? soulNumber.toUpperCase();
  const score = result.human_score  ?? 0;

  return {
    title:       `${name} — Verified Human · SOUL`,
    description: `Soul Score ${score}/100. Real-world identity verified by SOUL.`,
    openGraph: {
      title:       `${name} is a verified human`,
      description: `Soul Score ${score}/100 · ${result.signals?.encounters_total ?? 0} real-world encounters · Verified on SOUL`,
      siteName:    'SOUL',
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SoulIdPage({
  params,
}: {
  params: Promise<{ soulNumber: string }>;
}) {
  const { soulNumber } = await params;
  const result = await fetchIdentity(soulNumber.toUpperCase());

  const tierColor = result.tier ? (TIER_COLORS[result.tier] ?? '#FFFFFF') : '#FFFFFF';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 md:px-10 py-5 flex items-center justify-between flex-shrink-0">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] uppercase hover:text-zinc-300 transition-colors">
          SOUL
        </Link>
        <span className="text-xs text-zinc-600 tracking-widest uppercase font-mono">Identity</span>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-6 py-14">
        <div className="w-full max-w-sm">

          {/* ── Not found ─────────────────────────────────────────────────── */}
          {!result.valid && (result.error || result.reason) && (
            <div className="text-center pt-12">
              <div className="w-16 h-16 rounded-full border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                <span className="text-zinc-700 font-mono text-lg">?</span>
              </div>
              <p className="text-xs font-mono text-zinc-600 tracking-widest uppercase mb-3">Not Found</p>
              <p className="text-zinc-500 text-sm font-mono leading-relaxed">
                {result.error ?? 'No credential found for this Soul ID.'}
              </p>
            </div>
          )}

          {/* ── Expired / invalidated ─────────────────────────────────────── */}
          {!result.valid && !result.error && result.reason && (
            <div className="text-center pt-12">
              <div
                className="w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-6"
                style={{ borderColor: '#ef444440', background: '#ef44440d' }}
              >
                <span className="text-red-500 font-mono">✕</span>
              </div>
              <p className="text-xs font-mono text-red-500 tracking-widest uppercase mb-3">
                {result.reason === 'expired' ? 'Credential Expired' : 'Invalid'}
              </p>
              <p className="text-zinc-500 text-sm font-mono max-w-xs mx-auto leading-relaxed">
                {result.reason === 'expired'
                  ? 'This credential has expired. The holder needs to refresh their Soul ID.'
                  : 'This credential is no longer valid.'}
              </p>
            </div>
          )}

          {/* ── Valid identity ────────────────────────────────────────────── */}
          {result.valid && (
            <div>

              {/* Verified badge */}
              <div className="flex items-center gap-2.5 mb-10">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: '#22c55e', boxShadow: '0 0 8px #22c55e60' }}
                />
                <span className="text-xs font-mono tracking-[0.25em] uppercase text-green-400">
                  Verified Human
                </span>
              </div>

              {/* Identity */}
              <div className="mb-8">
                {result.display_name && (
                  <h1 className="text-3xl font-light tracking-tight mb-1">
                    {result.display_name}
                  </h1>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {result.username && (
                    <span className="text-sm font-mono text-zinc-400">{result.username}</span>
                  )}
                  {result.username && result.city && (
                    <span className="text-zinc-700 text-sm">·</span>
                  )}
                  {result.city && (
                    <span className="text-sm font-mono text-zinc-500">{result.city}</span>
                  )}
                </div>
                {result.soul_number && (
                  <p className="text-xs font-mono text-zinc-700 tracking-widest uppercase mt-2">
                    {result.soul_number}
                  </p>
                )}
              </div>

              {/* Score */}
              <div className="mb-8">
                <p className="text-xs font-mono text-zinc-600 tracking-[0.2em] uppercase mb-2">
                  Soul Score
                </p>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-light tabular-nums">{result.human_score}</span>
                  <span className="text-zinc-600 font-mono text-sm mb-1.5">/ 100</span>
                </div>
                {result.tier && (
                  <span
                    className="inline-block mt-2 text-xs font-mono tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border"
                    style={{
                      color:       tierColor,
                      borderColor: `${tierColor}40`,
                      background:  `${tierColor}10`,
                    }}
                  >
                    {result.tier}
                  </span>
                )}
              </div>

              <div className="border-t border-white/[0.06] mb-8" />

              {/* Proof — encounter signals */}
              {result.signals && (result.signals.encounters_total > 0 || result.signals.months_active > 0) && (
                <>
                  <div className="mb-8">
                    <p className="text-xs font-mono text-zinc-600 tracking-[0.2em] uppercase mb-5">
                      Real-world proof
                    </p>
                    <div className="space-y-4">
                      {result.signals.encounters_total > 0 && (
                        <div className="flex items-start gap-4">
                          <span className="text-2xl font-light tabular-nums text-white w-20 flex-shrink-0">
                            {result.signals.encounters_total.toLocaleString()}
                          </span>
                          <div className="pt-1">
                            <p className="text-xs font-mono text-zinc-400 leading-relaxed">
                              real-world encounters with verified humans
                            </p>
                          </div>
                        </div>
                      )}
                      {result.signals.unique_humans_met > 0 && (
                        <div className="flex items-start gap-4">
                          <span className="text-2xl font-light tabular-nums text-white w-20 flex-shrink-0">
                            {result.signals.unique_humans_met.toLocaleString()}
                          </span>
                          <div className="pt-1">
                            <p className="text-xs font-mono text-zinc-400 leading-relaxed">
                              unique humans met in person
                            </p>
                          </div>
                        </div>
                      )}
                      {result.signals.months_active > 0 && (
                        <div className="flex items-start gap-4">
                          <span className="text-2xl font-light tabular-nums text-white w-20 flex-shrink-0">
                            {result.signals.months_active}
                          </span>
                          <div className="pt-1">
                            <p className="text-xs font-mono text-zinc-400 leading-relaxed">
                              {plural(result.signals.months_active, 'month')} of verified activity
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-mono text-zinc-700 mt-5 leading-relaxed">
                      Real-world presence cannot be manufactured, purchased, or generated by a model.
                    </p>
                  </div>
                  <div className="border-t border-white/[0.06] mb-8" />
                </>
              )}

              {/* Verified accounts */}
              {result.verified_accounts && result.verified_accounts.length > 0 && (
                <>
                  <div className="mb-8">
                    <p className="text-xs font-mono text-zinc-600 tracking-[0.2em] uppercase mb-5">
                      Verified accounts
                    </p>
                    <div className="space-y-3">
                      {result.verified_accounts.map((acct) => (
                        <div key={acct.platform} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-zinc-500 w-20 tracking-wider uppercase">
                              {PLATFORM_LABELS[acct.platform] ?? acct.platform}
                            </span>
                            <span className="text-sm font-mono text-zinc-200">{acct.handle}</span>
                          </div>
                          <span
                            className="text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded"
                            style={{ color: '#22c55e', background: '#22c55e12' }}
                          >
                            verified
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-white/[0.06] mb-8" />
                </>
              )}

              {/* Credential metadata */}
              <div className="space-y-3 mb-10">
                {result.issued_at && (
                  <div className="flex justify-between">
                    <span className="text-xs font-mono text-zinc-600 tracking-wider uppercase">Issued</span>
                    <span className="text-xs font-mono text-zinc-400">{fmt(result.issued_at)}</span>
                  </div>
                )}
                {result.expires_at && (
                  <div className="flex justify-between">
                    <span className="text-xs font-mono text-zinc-600 tracking-wider uppercase">Expires</span>
                    <span className="text-xs font-mono text-zinc-400">{fmt(result.expires_at)}</span>
                  </div>
                )}
                {result.verification_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-xs font-mono text-zinc-600 tracking-wider uppercase">Scanned</span>
                    <span className="text-xs font-mono text-zinc-400">
                      {plural(result.verification_count, 'time')}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <p className="text-[10px] font-mono text-zinc-700 tracking-widest uppercase text-center">
                Verified by SOUL · soulverified.com
              </p>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
