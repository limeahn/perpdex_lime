'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolRow = {
  slug?: string;
  name: string;
  tvl: number;
  volume24h: number | null;
  users24h: number | null;
  d1: number | null;
  d7: number | null;
  link: string;
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

const DEXES: Array<{ slug?: string; name: string; link: string }> = [
  { slug: 'gmx', name: 'GMX', link: 'https://app.gmx.io/' },
  { slug: 'dydx', name: 'dYdX', link: 'https://trade.dydx.exchange/' },
  { slug: 'hyperliquid', name: 'Hyperliquid', link: 'https://app.hyperliquid.xyz/' },
  { slug: 'apex-protocol', name: 'ApeX', link: 'https://pro.apex.exchange/' },
  { name: 'Extended', link: 'https://app.extended.exchange/join/LIME' },
  { name: 'STANDX', link: 'https://standx.com/referral?code=lime' },
  { name: 'Pacifica', link: 'https://app.pacifica.fi?referral=lime' },
  { name: 'Ostium', link: 'https://app.ostium.com/trade?from=SPX&to=USD&ref=RJ1QP' },
  { name: 'Backpack', link: 'https://backpack.exchange/refer/arch' },
];

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

function normalizeHistorical(input: unknown): HistoricalPoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((r) => ({ date: n((r as any).date), totalLiquidityUSD: n((r as any).totalLiquidityUSD ?? (r as any).tvl) }))
    .filter((x) => x.date > 0)
    .sort((a, b) => a.date - b.date);
}

function pct(points: HistoricalPoint[], days: number): number | null {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const prev = [...points].reverse().find((p) => p.date <= latest.date - days * 86400);
  if (!prev || !prev.totalLiquidityUSD) return null;
  return ((latest.totalLiquidityUSD - prev.totalLiquidityUSD) / prev.totalLiquidityUSD) * 100;
}

function money(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function p(v: number | null) {
  if (v == null) return '-';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function users(v: number | null) {
  if (v == null || v <= 0) return '-';
  return Math.round(v).toLocaleString();
}

export default function Home() {
  const [dexRows, setDexRows] = useState<ProtocolRow[]>([]);
  const [coinRows, setCoinRows] = useState<CoinRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const [overviewRes, dexSettled, geckoRes, cmcRes, backpackTickersRes] = await Promise.all([
        axios.get('https://api.llama.fi/overview/derivatives?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true').catch(() => null),
        Promise.allSettled(
          DEXES.map(async (dex) => {
            if (!dex.slug) {
              return {
                name: dex.name,
                tvl: 0,
                volume24h: null,
                users24h: null,
                d1: null,
                d7: null,
                link: dex.link,
              } as ProtocolRow;
            }
            const res = await axios.get(`https://api.llama.fi/protocol/${dex.slug}`);
            const hist = normalizeHistorical((res.data as any).tvl);
            const tvl = hist.length ? hist[hist.length - 1].totalLiquidityUSD : 0;
            return {
              slug: dex.slug,
              name: (res.data as any).name ?? dex.name,
              tvl,
              volume24h: null,
              users24h: null,
              d1: pct(hist, 1),
              d7: pct(hist, 7),
              link: dex.link,
            } as ProtocolRow;
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
        axios.get('https://api.backpack.exchange/api/v1/tickers').catch(() => null),
      ]);

      const overviewProtocols: any[] = overviewRes?.data?.protocols ?? [];
      const pickOverview = (name: string, slug?: string) => {
        const matched = overviewProtocols.filter((p) => {
          const hay = `${p?.displayName ?? ''} ${p?.name ?? ''} ${p?.slug ?? ''} ${p?.module ?? ''} ${(p?.linkedProtocols ?? []).join(' ')}`.toLowerCase();
          return hay.includes(name.toLowerCase()) || (slug ? hay.includes(slug.toLowerCase()) : false);
        });
        if (!matched.length) return null;
        return matched.sort((a, b) => n(b?.total24h) - n(a?.total24h))[0];
      };

      const backpackTickers: any[] = Array.isArray(backpackTickersRes?.data) ? backpackTickersRes.data : [];
      const backpackPerpVolume24h = backpackTickers
        .filter((t) => String(t?.symbol ?? '').includes('_PERP'))
        .reduce((sum, t) => sum + n(t?.quoteVolume), 0);

      const dex = dexSettled
        .filter((r): r is PromiseFulfilledResult<ProtocolRow> => r.status === 'fulfilled')
        .map((r) => {
          if (r.value.name.toLowerCase() === 'backpack') {
            return {
              ...r.value,
              volume24h: backpackPerpVolume24h > 0 ? backpackPerpVolume24h : null,
              users24h: null,
            };
          }

          const ov = pickOverview(r.value.name, r.value.slug);
          return {
            ...r.value,
            volume24h: ov ? n(ov.total24h) : null,
            users24h: ov ? n(ov.users24h ?? ov.uniqueUsers24h ?? ov.activeUsers24h) || null : null,
          };
        })
        .sort((a, b) => b.tvl - a.tvl);
      setDexRows(dex);

      const gecko: CoinRow[] = (geckoRes.data as any[]).map((c) => ({
        id: `g-${c.id}`,
        symbol: String(c.symbol).toUpperCase(),
        name: c.name,
        price: n(c.current_price),
        change24h: n(c.price_change_percentage_24h),
        marketCap: n(c.market_cap),
        source: 'coingecko',
      }));
      const cmcRaw = cmcRes?.data?.data as any[] | undefined;
      const cmc: CoinRow[] = Array.isArray(cmcRaw)
        ? cmcRaw.map((c) => ({
            id: `c-${c.id}`,
            symbol: c.symbol,
            name: c.name,
            price: n(c.quote?.USD?.price),
            change24h: n(c.quote?.USD?.percent_change_24h),
            marketCap: n(c.quote?.USD?.market_cap),
            source: 'cmc',
          }))
        : [];
      setCoinRows([...cmc, ...gecko].slice(0, 8));
      setLoading(false);
    };
    run();
  }, []);

  const total = useMemo(() => dexRows.reduce((s, r) => s + r.tvl, 0), [dexRows]);

  return (
    <main className="min-h-screen bg-[#060912] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(99,102,241,0.30),transparent_34%),radial-gradient(circle_at_85%_8%,rgba(6,182,212,0.28),transparent_30%),radial-gradient(circle_at_50%_92%,rgba(217,70,239,0.22),transparent_35%),radial-gradient(circle_at_30%_70%,rgba(16,185,129,0.16),transparent_28%)]" />

      <div className="relative mx-auto max-w-[1320px] px-6 py-10 md:px-10">
        <header className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-8 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">LIME MARKET BOARD</p>
          <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Modern Perp Exchange Intelligence</h1>
          <p className="mt-3 max-w-3xl text-slate-300/90">실시간 TVL·볼륨·사용자 흐름을 한 화면에서. 거래소 클릭 시 바로 레퍼럴 링크로 이동합니다.</p>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-indigo-300/30 bg-gradient-to-br from-indigo-400/30 via-blue-500/20 to-indigo-900/25 p-6 backdrop-blur">
            <p className="text-xs text-slate-300">Total TVL</p>
            <p className="mt-2 text-3xl font-semibold">{money(total)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400/30 via-sky-500/20 to-cyan-900/25 p-6 backdrop-blur">
            <p className="text-xs text-slate-300">Tracked Exchanges</p>
            <p className="mt-2 text-3xl font-semibold">{dexRows.length}</p>
          </div>
          <div className="rounded-2xl border border-fuchsia-300/30 bg-gradient-to-br from-fuchsia-400/30 via-pink-500/20 to-fuchsia-900/25 p-6 backdrop-blur">
            <p className="text-xs text-slate-300">Top Exchange</p>
            <p className="mt-2 text-3xl font-semibold">{dexRows[0]?.name ?? '-'}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 xl:grid-cols-5">
          <div className="xl:col-span-3 rounded-3xl border border-blue-300/20 bg-gradient-to-b from-blue-500/10 to-indigo-900/10 p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Exchange Metrics</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 text-slate-300">
                  <tr>
                    <th className="py-3 text-left">Exchange</th>
                    <th className="py-3 text-right">TVL</th>
                    <th className="py-3 text-right">24H Vol</th>
                    <th className="py-3 text-right">Users</th>
                    <th className="py-3 text-right">1D</th>
                    <th className="py-3 text-right">7D</th>
                    <th className="py-3 text-right">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="py-6 text-slate-400" colSpan={7}>Loading...</td>
                    </tr>
                  )}
                  {!loading &&
                    dexRows.map((r) => (
                      <tr
                        key={`${r.name}-${r.link}`}
                        className="cursor-pointer border-b border-white/5 transition hover:bg-cyan-300/[0.10]"
                        onClick={() => window.open(r.link, '_blank', 'noopener,noreferrer')}
                      >
                        <td className="py-4 font-medium">{r.name}</td>
                        <td className="py-4 text-right">{r.tvl > 0 ? money(r.tvl) : '-'}</td>
                        <td className="py-4 text-right">{r.volume24h != null && r.volume24h > 0 ? money(r.volume24h) : '-'}</td>
                        <td className="py-4 text-right">{users(r.users24h)}</td>
                        <td className={`py-4 text-right ${r.d1 != null && r.d1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{p(r.d1)}</td>
                        <td className={`py-4 text-right ${r.d7 != null && r.d7 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{p(r.d7)}</td>
                        <td className="py-4 text-right text-cyan-300">Open ↗</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="xl:col-span-2 rounded-3xl border border-fuchsia-300/20 bg-gradient-to-b from-fuchsia-500/10 to-indigo-900/10 p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Coin Pulse</h2>
            <div className="space-y-3">
              {coinRows.map((c) => (
                <div key={c.id} className="rounded-xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.symbol} · {c.source.toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{money(c.price)}</p>
                      <p className={c.change24h >= 0 ? 'text-emerald-400 text-sm' : 'text-rose-400 text-sm'}>{p(c.change24h)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
