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
  source: 'coingecko' | 'cmc';
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

function formatPct(v: number | null): string {
  if (v == null) return '-';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function tone(v: number | null): string {
  if (v == null) return 'text-slate-400';
  return v >= 0 ? 'text-emerald-600' : 'text-rose-500';
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
        const [dexSettled, geckoRes, cmcRes] = await Promise.all([
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
          axios.get('/api/market/cmc').catch(() => null),
        ]);

        const d = dexSettled
          .filter((r): r is PromiseFulfilledResult<ProtocolRow> => r.status === 'fulfilled')
          .map((r) => r.value)
          .sort((a, b) => b.tvl - a.tvl);
        setDexRows(d);

        const geckoCoins: CoinRow[] = (geckoRes.data as Record<string, unknown>[]).map((c) => ({
          id: `gecko-${String(c.id)}`,
          symbol: String(c.symbol).toUpperCase(),
          name: String(c.name),
          price: toNumber(c.current_price),
          change24h: toNumber(c.price_change_percentage_24h),
          marketCap: toNumber(c.market_cap),
          source: 'coingecko',
        }));

        const cmcRaw = cmcRes?.data?.data as Record<string, unknown>[] | undefined;
        const cmcCoins: CoinRow[] = Array.isArray(cmcRaw)
          ? cmcRaw.map((c) => {
              const q = (c.quote as Record<string, unknown>)?.USD as Record<string, unknown>;
              return {
                id: `cmc-${String(c.id)}`,
                symbol: String(c.symbol),
                name: String(c.name),
                price: toNumber(q?.price),
                change24h: toNumber(q?.percent_change_24h),
                marketCap: toNumber(q?.market_cap),
                source: 'cmc',
              };
            })
          : [];

        const merged = [...cmcCoins, ...geckoCoins].slice(0, 12);
        setCoinRows(merged);

        if (!d.length && !merged.length) setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        else if (!cmcCoins.length)
          setError('CoinMarketCap 키가 없거나 제한되어 CoinGecko 데이터 중심으로 표시 중입니다.');
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
  const avgDex1d = useMemo(() => {
    const vals = dexRows.map((d) => d.d1).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [dexRows]);
  const topDex = dexRows[0];

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#22262f]">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-8 md:px-8 md:py-12">
        <p className="text-sm font-semibold text-[#4b7bec]">Perp Pulse · Market Console</p>
        <h1 className="mt-3 text-3xl md:text-5xl font-bold leading-tight tracking-tight">
          빠른 의사결정을 위한
          <br className="hidden md:block" /> 시장 데이터 대시보드
        </h1>
        <p className="mt-3 max-w-3xl text-sm md:text-base text-slate-500">
          Toss의 깔끔한 정보 구조와 coinary.ai의 데이터 밀도를 참고해 구성했습니다.
          DefiLlama · CoinMarketCap · CoinGecko를 한 화면에서 함께 확인하세요.
        </p>

        <section className="mt-9 grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="rounded-[36px] bg-[#eef4ff] p-6 md:p-7 shadow-[0_10px_24px_rgba(30,41,59,0.10)] border-2 border-[#cdddf7]">
            <p className="text-xs text-slate-500">Total TVL</p>
            <p className="mt-1 text-2xl md:text-3xl font-bold">{formatMoney(totalTvl)}</p>
            <p className="mt-2 text-xs text-slate-400">Perp DEX aggregate · DefiLlama</p>
          </article>
          <article className="rounded-[36px] bg-[#f2efff] p-6 md:p-7 shadow-[0_10px_24px_rgba(30,41,59,0.10)] border-2 border-[#ddd1fb]">
            <p className="text-xs text-slate-500">Avg 24H Move (DEX)</p>
            <p className={`mt-1 text-2xl md:text-3xl font-bold ${tone(avgDex1d)}`}>{formatPct(avgDex1d)}</p>
            <p className="mt-2 text-xs text-slate-400">평균 1일 변화율</p>
          </article>
          <article className="rounded-[36px] bg-[#eefbf3] p-6 md:p-7 shadow-[0_10px_24px_rgba(30,41,59,0.10)] border-2 border-[#c9eecf]">
            <p className="text-xs text-slate-500">Top DEX by TVL</p>
            <p className="mt-1 text-2xl md:text-3xl font-bold">{topDex?.name ?? '-'}</p>
            <p className="mt-2 text-xs text-slate-400">{topDex ? formatMoney(topDex.tvl) : '-'}</p>
          </article>
        </section>

        {error && <div className="mt-6 rounded-[28px] bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <section className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-7">
          <div className="lg:col-span-2 rounded-[36px] bg-[#f7f4ff] p-5 shadow-[0_10px_24px_rgba(30,41,59,0.10)] border-2 border-[#ddd3fa]">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-xl font-bold">Perp DEX 랭킹</h2>
              <span className="text-xs text-slate-400">TVL / 1D / 7D</span>
            </div>
            <div className="space-y-4">
              {loading && [1, 2, 3].map((n) => <div key={n} className="h-16 rounded-[28px] bg-slate-100 animate-pulse" />)}
              {!loading && dexRows.map((r, i) => (
                <article key={r.slug} className="rounded-[28px] bg-white px-4 py-4 border border-[#e7edf5] shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-400">#{i + 1}</p>
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-slate-500">{formatMoney(r.tvl)}</p>
                    </div>
                    <div className="text-right text-xs leading-6">
                      <div className={tone(r.d1)}>1D {formatPct(r.d1)}</div>
                      <div className={tone(r.d7)}>7D {formatPct(r.d7)}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-[36px] bg-[#f7fbff] p-5 shadow-[0_10px_24px_rgba(30,41,59,0.10)] border-2 border-[#d1e3f8]">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-xl font-bold">코인 마켓 스냅샷</h2>
              <span className="text-xs text-slate-400">CMC + CoinGecko</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm leading-6">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="py-2 text-left font-medium">코인</th>
                    <th className="py-2 text-right font-medium">가격</th>
                    <th className="py-2 text-right font-medium">24H</th>
                    <th className="py-2 text-right font-medium">시가총액</th>
                    <th className="py-2 text-right font-medium">출처</th>
                  </tr>
                </thead>
                <tbody>
                  {coinRows.map((c) => (
                    <tr key={c.id} className="border-b border-[#e8edf4]">
                      <td className="py-4">
                        <p className="font-semibold leading-4">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.symbol}</p>
                      </td>
                      <td className="py-4 text-right font-semibold">{formatMoney(c.price)}</td>
                      <td className={`py-4 text-right font-semibold ${tone(c.change24h)}`}>
                        {formatPct(c.change24h)}
                      </td>
                      <td className="py-4 text-right">{formatMoney(c.marketCap)}</td>
                      <td className="py-4 text-right text-xs text-slate-400 uppercase">{c.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
