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

        const merged = [...cmcCoins, ...geckoCoins].slice(0, 8);
        setCoinRows(merged);

        if (!d.length && !merged.length) setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } catch (e) {
        console.error(e);
        setError('일부 데이터 소스 연결에 실패했습니다.');
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f7f9ff] to-[#f4f7fb] text-[#1b2430]">
      <div className="mx-auto w-full max-w-[1040px] px-6 py-12 md:px-12 md:py-16">
        <header className="rounded-[40px] bg-white/85 backdrop-blur border border-[#e8eef8] shadow-[0_12px_30px_rgba(71,85,105,0.08)] p-8 md:p-10">
          <p className="text-sm font-semibold text-[#5b7cfa]">Perp Pulse</p>
          <h1 className="mt-3 text-3xl md:text-5xl font-bold leading-tight tracking-tight">
            더 보기 좋고,
            <br className="hidden md:block" /> 더 빠르게 읽히는 시장 대시보드
          </h1>
          <p className="mt-4 text-sm md:text-base text-slate-500 max-w-3xl">
            Toss 감성의 말랑한 UI에 핵심 지표만 담았습니다. TVL, DEX 변화율, 코인 시황을 한 화면에서 확인해요.
          </p>
        </header>

        {error && <div className="mt-6 rounded-[24px] bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <article className="rounded-[34px] bg-[#ecf4ff] border-2 border-[#d7e6fb] p-8 shadow-[0_10px_24px_rgba(30,41,59,0.08)]">
            <p className="text-xs text-slate-500">Total TVL</p>
            <p className="mt-2 text-3xl font-bold">{formatMoney(totalTvl)}</p>
            <p className="mt-2 text-xs text-slate-500">DefiLlama Aggregate</p>
          </article>
          <article className="rounded-[34px] bg-[#f4f0ff] border-2 border-[#e3d8fb] p-8 shadow-[0_10px_24px_rgba(30,41,59,0.08)]">
            <p className="text-xs text-slate-500">Avg DEX 24H</p>
            <p className={`mt-2 text-3xl font-bold ${tone(avgDex1d)}`}>{formatPct(avgDex1d)}</p>
            <p className="mt-2 text-xs text-slate-500">평균 1일 변화율</p>
          </article>
          <article className="rounded-[34px] bg-[#effaf3] border-2 border-[#d5f0de] p-8 shadow-[0_10px_24px_rgba(30,41,59,0.08)]">
            <p className="text-xs text-slate-500">Tracked DEX</p>
            <p className="mt-2 text-3xl font-bold">{dexRows.length}</p>
            <p className="mt-2 text-xs text-slate-500">GMX · dYdX · Hyperliquid · ApeX</p>
          </article>
        </section>

        <section className="mt-14 grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <div className="mb-4 px-1">
              <div className="flex items-end justify-between">
                <div><h2 className="text-2xl font-bold">Perp DEX 랭킹</h2><p className="text-sm text-slate-500 mt-1">거래소별 유동성과 단기 추세</p></div>
                <span className="text-sm text-slate-500">TVL / 1D / 7D</span>
              </div>
            </div>
            <div className="rounded-[34px] bg-[#faf7ff] border-2 border-[#e6dcfb] p-8 shadow-[0_10px_24px_rgba(30,41,59,0.08)]">
            <div className="space-y-5">
              {loading && [1, 2, 3].map((n) => <div key={n} className="h-20 rounded-[26px] bg-white/70 animate-pulse" />)}
              {!loading && dexRows.map((r, i) => (
                <article key={r.slug} className="rounded-[26px] bg-white px-6 py-6 border border-[#e8edf5] shadow-[0_3px_10px_rgba(30,41,59,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-400">#{i + 1}</p>
                      <p className="font-semibold text-[18px]">{r.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{formatMoney(r.tvl)}</p>
                    </div>
                    <div className="text-right text-sm leading-8">
                      <div className={tone(r.d1)}>1D {formatPct(r.d1)}</div>
                      <div className={tone(r.d7)}>7D {formatPct(r.d7)}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          </div>

          <div className="lg:col-span-3">
            <div className="mb-4 px-1">
              <div className="flex items-end justify-between">
                <div><h2 className="text-2xl font-bold">코인 마켓 스냅샷</h2><p className="text-sm text-slate-500 mt-1">가격 · 변동률 · 시총 비교</p></div>
                <span className="text-sm text-slate-500">CMC + CoinGecko</span>
              </div>
            </div>
            <div className="rounded-[34px] bg-[#f8fcff] border-2 border-[#dbe9f8] p-8 shadow-[0_10px_24px_rgba(30,41,59,0.08)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm leading-9">
                <thead className="text-slate-400 border-b border-[#e2e8f0]">
                  <tr>
                    <th className="py-3 text-left font-medium">코인</th>
                    <th className="py-3 text-right font-medium">가격</th>
                    <th className="py-3 text-right font-medium">24H</th>
                    <th className="py-3 text-right font-medium">시가총액</th>
                    <th className="py-3 text-right font-medium">출처</th>
                  </tr>
                </thead>
                <tbody>
                  {coinRows.map((c) => (
                    <tr key={c.id} className="border-b border-[#e8edf4]">
                      <td className="py-4">
                        <p className="font-semibold leading-5">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.symbol}</p>
                      </td>
                      <td className="py-4 text-right font-semibold">{formatMoney(c.price)}</td>
                      <td className={`py-4 text-right font-semibold ${tone(c.change24h)}`}>{formatPct(c.change24h)}</td>
                      <td className="py-4 text-right">{formatMoney(c.marketCap)}</td>
                      <td className="py-4 text-right text-xs text-slate-400 uppercase">{c.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </section>
      </div>
    </main>
  );
}
