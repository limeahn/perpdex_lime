'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolData = {
  slug: string;
  name: string;
  tvl: number;
  historicalTvl: HistoricalPoint[];
};

const DEXES = [
  { slug: 'gmx', name: 'GMX' },
  { slug: 'dydx', name: 'dYdX' },
  { slug: 'apex-protocol', name: 'ApeX' },
  { slug: 'hyperliquid', name: 'Hyperliquid' },
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
    .filter((x) => x.date > 0 && x.totalLiquidityUSD >= 0);
}

function formatMoney(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function changePct(points: HistoricalPoint[], days: number): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const latest = sorted[sorted.length - 1]?.totalLiquidityUSD;
  const target = sorted[sorted.length - 1].date - days * 86400;
  const prev = [...sorted].reverse().find((p) => p.date <= target)?.totalLiquidityUSD;
  if (!latest || !prev) return null;
  return ((latest - prev) / prev) * 100;
}

export default function Home() {
  const [data, setData] = useState<ProtocolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const rows = await Promise.all(
          DEXES.map(async (dex) => {
            const res = await axios.get(`https://api.llama.fi/protocol/${dex.slug}`);
            const p = res.data as Record<string, unknown>;
            const hist = normalizeHistorical(p.tvl);
            const latest = hist.length ? hist[hist.length - 1].totalLiquidityUSD : 0;

            return {
              slug: dex.slug,
              name: String(p.name ?? dex.name),
              tvl: latest,
              historicalTvl: hist,
            } satisfies ProtocolData;
          }),
        );
        setData(rows);
      } catch (e) {
        console.error(e);
        setError('데이터 로딩 실패. 잠시 후 새로고침 해주세요.');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const total = useMemo(() => data.reduce((s, d) => s + d.tvl, 0), [data]);

  return (
    <main className="min-h-screen bg-[#f2f4f6] text-slate-900">
      <div className="mx-auto w-full max-w-[820px] px-4 py-5 md:py-8 space-y-4">
        <header className="rounded-[28px] bg-gradient-to-r from-[#1b64f2] to-[#3182f6] p-6 text-white shadow-lg">
          <p className="text-sm opacity-90">홈 · 투자</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-extrabold leading-tight">Perpetual DEX 대시보드</h1>
          <p className="mt-2 text-sm opacity-90">토스 감성 UI + PerpetualPulse 참고 데이터</p>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">총 TVL</p>
            <p className="mt-1 text-xl md:text-2xl font-extrabold">{formatMoney(total)}</p>
          </div>
          <div className="rounded-[22px] bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">추적 거래소</p>
            <p className="mt-1 text-xl md:text-2xl font-extrabold">{data.length}개</p>
          </div>
        </section>

        {error && <div className="rounded-[18px] bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[22px] bg-white" />
            ))}
          </div>
        )}

        {!loading && data.length === 0 && (
          <div className="rounded-[22px] bg-white p-4 text-sm text-slate-600 shadow-sm">
            데이터가 비어 있습니다. API 상태를 확인하고 다시 시도해 주세요.
          </div>
        )}

        <section className="space-y-3">
          {data.map((d) => {
            const d1 = changePct(d.historicalTvl, 1);
            const d7 = changePct(d.historicalTvl, 7);
            return (
              <article key={d.slug} className="rounded-[24px] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg md:text-xl font-bold">{d.name}</h2>
                    <p className="text-sm text-slate-500">TVL {formatMoney(d.tvl)}</p>
                  </div>
                  <div className="text-right text-xs rounded-xl bg-slate-50 px-2 py-1">
                    <p>1D {d1 == null ? '-' : `${d1 > 0 ? '+' : ''}${d1.toFixed(2)}%`}</p>
                    <p>7D {d7 == null ? '-' : `${d7 > 0 ? '+' : ''}${d7.toFixed(2)}%`}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
