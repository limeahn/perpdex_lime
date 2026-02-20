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
  { slug: 'hyperliquid', name: 'Hyperliquid', link: 'https://app.hyperliquid.xyz/' },
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);

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

    setLastUpdatedAt(Date.now());
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchData(false);
    const poll = setInterval(() => fetchData(true), 30000);
    const ticker = setInterval(() => setNowTs(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(ticker);
    };
  }, []);

  const total = useMemo(() => dexRows.reduce((s, r) => s + r.tvl, 0), [dexRows]);
  const secondsSinceUpdate = lastUpdatedAt ? Math.max(0, Math.floor((nowTs - lastUpdatedAt) / 1000)) : null;

  return (
    <main className="min-h-screen bg-[#060912] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(99,102,241,0.30),transparent_34%),radial-gradient(circle_at_85%_8%,rgba(6,182,212,0.28),transparent_30%),radial-gradient(circle_at_50%_92%,rgba(217,70,239,0.22),transparent_35%),radial-gradient(circle_at_30%_70%,rgba(16,185,129,0.16),transparent_28%)]" />

      <div className="relative mx-auto max-w-[1320px] px-6 py-10 md:px-10">
        <header className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-8 backdrop-blur-xl">
          <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Modern Perp Exchange Intelligence</h1>
          <p className="mt-3 max-w-3xl text-slate-300/90">실시간 TVL·볼륨·사용자 흐름을 한 화면에서 확인하세요.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> LIVE
            <span className="text-slate-300">· 30초 자동 갱신</span>
            <span className="text-slate-300">· 마지막 업데이트 {secondsSinceUpdate == null ? '-' : `${secondsSinceUpdate}s 전`}</span>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-indigo-300/30 bg-gradient-to-br from-indigo-400/30 via-blue-500/20 to-indigo-900/25 p-6 backdrop-blur">
            <p className="text-xs text-slate-300">Total TVL</p>
            <p className="mt-2 text-3xl font-semibold">{money(total)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400/30 via-sky-500/20 to-cyan-900/25 p-6 backdrop-blur">
            <p className="text-xs text-slate-300">Tracked Exchanges</p>
            <p className="mt-2 text-3xl font-semibold">{dexRows.length}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 xl:grid-cols-5">
          <div className="xl:col-span-3 rounded-3xl border border-blue-300/20 bg-gradient-to-b from-blue-500/10 to-indigo-900/10 p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Exchange Cards</h2>
            {loading && <div className="text-slate-400">Loading...</div>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {!loading &&
                dexRows.map((r) => (
                  <button
                    key={`${r.name}-${r.link}`}
                    className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-900/70 to-indigo-900/40 p-5 text-left transition hover:scale-[1.01] hover:border-cyan-300/40"
                    onClick={() => window.open(r.link, '_blank', 'noopener,noreferrer')}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-lg font-semibold">{r.name}</p>
                      <span className="text-cyan-300 text-sm">Open ↗</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <p className="text-slate-400">TVL</p>
                      <p className="text-right">{r.tvl > 0 ? money(r.tvl) : '-'}</p>
                      <p className="text-slate-400">24H Vol</p>
                      <p className="text-right">{r.volume24h != null && r.volume24h > 0 ? money(r.volume24h) : '-'}</p>
                      <p className="text-slate-400">Users</p>
                      <p className="text-right">{users(r.users24h)}</p>
                      <p className="text-slate-400">1D / 7D</p>
                      <p className={`text-right ${r.d1 != null && r.d1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p(r.d1)} <span className={r.d7 != null && r.d7 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>/ {p(r.d7)}</span>
                      </p>
                    </div>
                  </button>
                ))}
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
