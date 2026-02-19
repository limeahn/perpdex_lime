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

function pct(points: HistoricalPoint[], days: number): number | null {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const targetTs = latest.date - days * 86400;
  const prev = [...points].reverse().find((p) => p.date <= targetTs);
  if (!prev || !prev.totalLiquidityUSD) return null;
  return ((latest.totalLiquidityUSD - prev.totalLiquidityUSD) / prev.totalLiquidityUSD) * 100;
}

function formatMoney(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function PctText({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">-</span>;
  const up = value >= 0;
  return (
    <span className={up ? 'text-emerald-600' : 'text-rose-500'}>
      {up ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}

export default function Home() {
  const [rows, setRows] = useState<ProtocolData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
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
      setLoading(false);
    };

    fetchAll();
  }, []);

  const totalTvl = useMemo(() => rows.reduce((sum, r) => sum + r.tvl, 0), [rows]);

  return (
    <main className="min-h-screen bg-[#f9fafb] text-[#191f28]">
      <div className="mx-auto w-full max-w-[980px] px-5 py-7 md:py-10">
        <p className="text-sm font-semibold text-[#3182f6]">홈 · 투자</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
          Perpetual DEX,
          <br />
          한눈에 똑똑하게
        </h1>
        <p className="mt-3 text-base text-slate-500">토스 스타일의 심플한 정보 카드 + 실시간 Perp DEX 데이터</p>

        <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="rounded-3xl bg-white p-6 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-slate-500">총 TVL</p>
            <p className="mt-1 text-3xl font-extrabold">{formatMoney(totalTvl)}</p>
          </article>
          <article className="rounded-3xl bg-white p-6 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-slate-500">거래소 수</p>
            <p className="mt-1 text-3xl font-extrabold">{rows.length}</p>
          </article>
          <article className="rounded-3xl bg-white p-6 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-slate-500">데이터 소스</p>
            <p className="mt-1 text-lg font-bold">DefiLlama Protocol</p>
          </article>
        </section>

        <section className="mt-6 space-y-3">
          {loading && [1, 2, 3].map((n) => <div key={n} className="h-24 rounded-3xl bg-white animate-pulse" />)}

          {!loading && rows.map((r, i) => (
            <article key={r.slug} className="rounded-3xl bg-white px-5 py-4 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">#{i + 1} 거래소</p>
                  <h3 className="text-xl font-bold mt-0.5">{r.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">TVL {formatMoney(r.tvl)}</p>
                </div>
                <div className="text-right text-sm leading-6">
                  <div>1D <PctText value={r.d1} /></div>
                  <div>7D <PctText value={r.d7} /></div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
