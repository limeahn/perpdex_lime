'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolData = {
  slug: string;
  name: string;
  tvl: number;
  d1: number | null;
  d7: number | null;
};

const DEXES = [
  { slug: 'gmx', name: 'GMX' },
  { slug: 'dydx', name: 'dYdX' },
  { slug: 'hyperliquid', name: 'Hyperliquid' },
  { slug: 'apex-protocol', name: 'ApeX' },
];

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeHistorical(input: unknown): HistoricalPoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        date: toNumber(r.date),
        totalLiquidityUSD: toNumber(r.totalLiquidityUSD ?? r.tvl),
      };
    })
    .filter((x) => x.date > 0 && x.totalLiquidityUSD >= 0)
    .sort((a, b) => a.date - b.date);
}

function formatMoney(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function pct(points: HistoricalPoint[], days: number): number | null {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const targetTs = latest.date - days * 86400;
  const prev = [...points].reverse().find((p) => p.date <= targetTs);
  if (!prev || !prev.totalLiquidityUSD) return null;
  return ((latest.totalLiquidityUSD - prev.totalLiquidityUSD) / prev.totalLiquidityUSD) * 100;
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">-</span>;
  const up = value >= 0;
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
      }`}
    >
      {up ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}

export default function Home() {
  const [rows, setRows] = useState<ProtocolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      const settled = await Promise.allSettled(
        DEXES.map(async (dex) => {
          const res = await axios.get(`https://api.llama.fi/protocol/${dex.slug}`);
          const p = res.data as Record<string, unknown>;
          const hist = normalizeHistorical(p.tvl);
          const latest = hist.length ? hist[hist.length - 1].totalLiquidityUSD : 0;

          return {
            slug: dex.slug,
            name: String(p.name ?? dex.name),
            tvl: latest,
            d1: pct(hist, 1),
            d7: pct(hist, 7),
          } satisfies ProtocolData;
        }),
      );

      const success = settled
        .filter((r): r is PromiseFulfilledResult<ProtocolData> => r.status === 'fulfilled')
        .map((r) => r.value)
        .sort((a, b) => b.tvl - a.tvl);

      setRows(success);
      if (success.length === 0) setError('데이터를 못 불러왔어요. 잠시 후 다시 시도해 주세요.');
      setLoading(false);
    };

    fetchAll();
  }, []);

  const totalTvl = useMemo(() => rows.reduce((sum, r) => sum + r.tvl, 0), [rows]);

  return (
    <main className="min-h-screen bg-[#f2f4f6] text-slate-900">
      <div className="mx-auto max-w-[860px] px-4 py-5 md:py-8 space-y-4">
        <header className="rounded-[28px] bg-gradient-to-r from-[#1b64f2] to-[#3182f6] p-6 text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)]">
          <p className="text-sm opacity-90">홈 · Perp</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-extrabold">Perpetual DEX Dashboard</h1>
          <p className="mt-2 text-sm opacity-90">데이터 중심 + 토스 스타일 카드 UI</p>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <article className="rounded-[22px] bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">총 TVL</p>
            <p className="mt-1 text-xl md:text-2xl font-extrabold">{formatMoney(totalTvl)}</p>
          </article>
          <article className="rounded-[22px] bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">거래소 수</p>
            <p className="mt-1 text-xl md:text-2xl font-extrabold">{rows.length}</p>
          </article>
        </section>

        <section className="space-y-3">
          {loading && [1, 2, 3, 4].map((n) => <div key={n} className="h-24 animate-pulse rounded-[22px] bg-white" />)}

          {!loading && rows.map((r, i) => (
            <article key={r.slug} className="rounded-[24px] bg-white p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">#{i + 1} {r.name}</p>
                  <p className="text-sm text-slate-500">TVL {formatMoney(r.tvl)}</p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>1D</span> <PctBadge value={r.d1} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>7D</span> <PctBadge value={r.d7} />
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!loading && rows.length === 0 && (
            <article className="rounded-[22px] bg-white p-4 text-sm text-slate-600 shadow-sm">표시할 데이터가 없습니다.</article>
          )}

          {error && <article className="rounded-[18px] bg-rose-50 p-3 text-sm text-rose-700">{error}</article>}
        </section>
      </div>
    </main>
  );
}
