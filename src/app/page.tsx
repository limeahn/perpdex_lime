'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolRow = {
  slug: string;
  name: string;
  tvl: number;
  d1: number | null;
  d7: number | null;
};

type CoinRow = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
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
  const [dexRows, setDexRows] = useState<ProtocolRow[]>([]);
  const [coinRows, setCoinRows] = useState<CoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      try {
        const [dexSettled, coinRes] = await Promise.all([
          Promise.allSettled(
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
              } satisfies ProtocolRow;
            }),
          ),
          axios.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: {
              vs_currency: 'usd',
              order: 'market_cap_desc',
              per_page: 8,
              page: 1,
              sparkline: false,
              price_change_percentage: '24h',
            },
          }),
        ]);

        const d = dexSettled
          .filter((r): r is PromiseFulfilledResult<ProtocolRow> => r.status === 'fulfilled')
          .map((r) => r.value)
          .sort((a, b) => b.tvl - a.tvl);
        setDexRows(d);

        const coins = (coinRes.data as Record<string, unknown>[]).map((c) => ({
          id: String(c.id),
          symbol: String(c.symbol).toUpperCase(),
          name: String(c.name),
          price: toNumber(c.current_price),
          change24h: toNumber(c.price_change_percentage_24h),
          marketCap: toNumber(c.market_cap),
        }));
        setCoinRows(coins);

        if (!d.length && !coins.length) {
          setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } catch (e) {
        console.error(e);
        setError('일부 데이터 소스 연결에 실패했습니다. 새로고침해 주세요.');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const totalTvl = useMemo(() => dexRows.reduce((sum, r) => sum + r.tvl, 0), [dexRows]);

  return (
    <main className="min-h-screen bg-[#f9fafb] text-[#191f28]">
      <div className="mx-auto w-full max-w-[1024px] px-5 py-7 md:py-10">
        <p className="text-sm font-semibold text-[#3182f6]">홈 · 투자</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
          시장을 읽는 가장 간단한 방법,
          <br />
          오늘의 Perpetual 대시보드
        </h1>
        <p className="mt-3 text-base text-slate-500">
          DefiLlama + CoinGecko 데이터를 한 화면에서 확인하세요. 복잡한 탭 이동 없이, 지금 필요한 숫자만 모았습니다.
        </p>

        <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="rounded-3xl bg-white p-6 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-slate-500">Perp DEX 총 TVL</p>
            <p className="mt-1 text-3xl font-extrabold">{formatMoney(totalTvl)}</p>
            <p className="mt-1 text-xs text-slate-400">Source: DefiLlama</p>
          </article>
          <article className="rounded-3xl bg-white p-6 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-slate-500">추적 중인 Perp 거래소</p>
            <p className="mt-1 text-3xl font-extrabold">{dexRows.length}</p>
            <p className="mt-1 text-xs text-slate-400">GMX · dYdX · Hyperliquid · ApeX</p>
          </article>
          <article className="rounded-3xl bg-white p-6 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-slate-500">코인 시가총액 상위</p>
            <p className="mt-1 text-3xl font-extrabold">{coinRows.length}</p>
            <p className="mt-1 text-xs text-slate-400">Source: CoinGecko</p>
          </article>
        </section>

        {error && <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-2xl font-bold">Perpetual DEX 현황</h2>
            <p className="text-sm text-slate-400">TVL / 1D / 7D</p>
          </div>
          <div className="space-y-3">
            {loading && [1, 2, 3].map((n) => <div key={n} className="h-24 rounded-3xl bg-white animate-pulse" />)}

            {!loading && dexRows.map((r, i) => (
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
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-2xl font-bold">코인 마켓 스냅샷</h2>
            <p className="text-sm text-slate-400">가격 / 24H / 시총</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {coinRows.map((c) => (
              <article key={c.id} className="rounded-3xl bg-white p-4 shadow-[0_2px_14px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatMoney(c.price)}</p>
                    <p className={c.change24h >= 0 ? 'text-emerald-600 text-sm' : 'text-rose-500 text-sm'}>
                      {c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(2)}%
                    </p>
                    <p className="text-xs text-slate-400">MC {formatMoney(c.marketCap)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
