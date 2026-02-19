'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolData = {
  slug: string;
  name: string;
  tvl: number;
  chainTvls: Record<string, number>;
  historicalTvl: HistoricalPoint[];
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['tvl', 'totalLiquidityUSD', 'usd', 'value', 'amount']) {
      const n = toNumber(obj[key]);
      if (n > 0) return n;
    }
    for (const v of Object.values(obj)) {
      const n = toNumber(v);
      if (n > 0) return n;
    }
  }
  return 0;
}

function normalizeChainTvls(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  return Object.entries(input as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [chain, raw]) => {
      acc[chain] = toNumber(raw);
      return acc;
    },
    {},
  );
}

function normalizeHistorical(input: unknown): HistoricalPoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const date = toNumber(obj.date);
      const totalLiquidityUSD = toNumber(obj.totalLiquidityUSD ?? obj.tvl);
      return { date, totalLiquidityUSD };
    })
    .filter((d) => d.date > 0 && d.totalLiquidityUSD >= 0);
}

function formatMoney(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toLocaleString()}`;
}

function calcChangePct(points: HistoricalPoint[], days: number): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const latest = sorted[sorted.length - 1]?.totalLiquidityUSD;
  const targetTs = sorted[sorted.length - 1].date - days * 86400;
  const prev = [...sorted].reverse().find((p) => p.date <= targetTs)?.totalLiquidityUSD;
  if (!latest || !prev) return null;
  return ((latest - prev) / prev) * 100;
}

const DEXES = [
  { slug: 'gmx', name: 'GMX' },
  { slug: 'dydx', name: 'dYdX' },
  { slug: 'apex-protocol', name: 'Apex' },
  { slug: 'hyperliquid', name: 'Hyperliquid' },
];

export default function Home() {
  const [data, setData] = useState<ProtocolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const results = await Promise.all(
          DEXES.map(async (dex) => {
            const response = await axios.get(`https://api.llama.fi/protocol/${dex.slug}`);
            const protocol = response.data as Record<string, unknown>;
            const chainTvls = normalizeChainTvls(protocol.currentChainTvls);
            const firstChain = Object.keys(chainTvls)[0];
            const historicalRaw =
              (protocol.chainTvls as Record<string, { tvl?: unknown }>)?.[firstChain]?.tvl ?? [];

            return {
              slug: dex.slug,
              name: String(protocol.name ?? dex.name),
              tvl: toNumber(protocol.tvl),
              chainTvls,
              historicalTvl: normalizeHistorical(historicalRaw),
            } satisfies ProtocolData;
          }),
        );

        setData(results);
      } catch (e) {
        console.error(e);
        setError('데이터를 불러오는 중 오류가 발생했어요. 잠시 후 새로고침 해주세요.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalTvl = useMemo(() => data.reduce((sum, d) => sum + d.tvl, 0), [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] p-6 md:p-10">
        <div className="mx-auto max-w-6xl animate-pulse space-y-4">
          <div className="h-10 w-64 rounded-xl bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="h-28 rounded-2xl bg-slate-200" />
            <div className="h-28 rounded-2xl bg-slate-200" />
            <div className="h-28 rounded-2xl bg-slate-200" />
          </div>
          <div className="h-80 rounded-2xl bg-slate-200" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f2f4f6] p-4 md:p-8 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[32px] bg-gradient-to-br from-[#3182f6] to-[#1b64f2] p-8 text-white shadow-[0_14px_36px_rgba(37,99,235,0.28)]">
          <p className="text-sm font-medium opacity-95">홈 · 투자</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold leading-tight">Perpetual DEX,
            <br />한 번에 똑똑하게</h1>
          <p className="mt-3 text-sm opacity-90">PerpetualPulse 참고 데이터 + Toss 스타일 UI</p>
        </header>

        {error && <div className="rounded-[24px] bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="space-y-3">
          <article className="rounded-[30px] bg-gradient-to-r from-[#f85640] to-[#ff7a1a] px-6 py-5 text-white shadow-[0_14px_30px_rgba(248,86,64,0.35)]">
            <p className="text-xs font-semibold opacity-90">오늘의 퍼프덱스 브리핑</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-extrabold">Total TVL {formatMoney(totalTvl)}</h3>
                <p className="mt-1 text-sm opacity-90">상위 Perp DEX의 실시간 유동성 추이</p>
              </div>
              <button className="rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-[#f85640] shadow">
                상세 보기
              </button>
            </div>
          </article>

          <article className="rounded-[30px] bg-gradient-to-r from-[#1d8f45] to-[#75c71f] px-6 py-5 text-white shadow-[0_14px_30px_rgba(34,197,94,0.28)]">
            <p className="text-xs font-semibold opacity-90">모니터링 현황</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-extrabold">{data.length}개 거래소 추적 중</h3>
                <p className="mt-1 text-sm opacity-90">GMX · dYdX · Hyperliquid · Apex</p>
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">LIVE</span>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-[28px] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-100">
            <p className="text-sm text-slate-500">총 TVL</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">{formatMoney(totalTvl)}</p>
          </div>
          <div className="rounded-[28px] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-100">
            <p className="text-sm text-slate-500">추적 거래소 수</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight">{data.length}</p>
          </div>
          <div className="rounded-[28px] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-100">
            <p className="text-sm text-slate-500">데이터 소스</p>
            <p className="mt-2 text-base font-bold">DefiLlama Protocol API</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.map((protocol) => {
            const oneDay = calcChangePct(protocol.historicalTvl, 1);
            const sevenDay = calcChangePct(protocol.historicalTvl, 7);

            return (
              <article
                key={protocol.slug}
                className="rounded-[30px] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.07)] border border-slate-100"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-900">{protocol.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">TVL: {formatMoney(protocol.tvl)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right text-xs text-slate-600">
                    <p>1D {oneDay === null ? '-' : `${oneDay > 0 ? '+' : ''}${oneDay.toFixed(2)}%`}</p>
                    <p>7D {sevenDay === null ? '-' : `${sevenDay > 0 ? '+' : ''}${sevenDay.toFixed(2)}%`}</p>
                  </div>
                </div>

                <div className="mb-4 h-56 rounded-[22px] bg-[#f7fafe] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={protocol.historicalTvl.slice(-60).map((d) => ({
                        date: new Date(d.date * 1000).toLocaleDateString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                        }),
                        tvl: d.totalLiquidityUSD,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                      <YAxis
                        tickFormatter={(v) => formatMoney(typeof v === 'number' ? v : Number(v) || 0)}
                        tick={{ fontSize: 11 }}
                        width={70}
                      />
                      <Tooltip formatter={(v) => formatMoney(typeof v === 'number' ? v : Number(v) || 0)} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="tvl"
                        stroke="#3182f6"
                        strokeWidth={3}
                        dot={false}
                        name="TVL"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-hidden rounded-[20px] border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Chain</th>
                        <th className="px-4 py-3 text-right">TVL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(protocol.chainTvls)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([chain, tvl]) => (
                          <tr key={chain} className="border-t border-slate-100">
                            <td className="px-4 py-3">{chain}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatMoney(tvl)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
