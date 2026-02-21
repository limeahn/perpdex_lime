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
  tvlSeries: number[];
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
  const [nextRefreshAt, setNextRefreshAt] = useState<number>(Date.now() + 5000);
  const [activeTab, setActiveTab] = useState<'all' | 'exchanges' | 'coins'>('all');

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const ts = Date.now();

      const [overviewRes, dexSettled, geckoRes, cmcRes, backpackTickersRes] = await Promise.all([
      axios.get('https://api.llama.fi/overview/derivatives?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', { params: { _ts: ts } }).catch(() => null),
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
          const res = await axios.get(`https://api.llama.fi/protocol/${dex.slug}`, { params: { _ts: ts } });
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
    } catch (e) {
      console.error('auto-refresh fetch failed', e);
    } finally {
      setNextRefreshAt(Date.now() + 5000);
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const poll = setInterval(() => fetchData(true), 5000);
    const ticker = setInterval(() => setNowTs(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(ticker);
    };
  }, []);

  const total = useMemo(() => dexRows.reduce((s, r) => s + r.tvl, 0), [dexRows]);
  const secondsSinceUpdate = lastUpdatedAt ? Math.max(0, Math.floor((nowTs - lastUpdatedAt) / 1000)) : null;

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-[#191f28]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(56,189,248,0.20),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.20),transparent_30%),radial-gradient(circle_at_50%_90%,rgba(217,70,239,0.14),transparent_36%)]" />

      <div className="relative mx-auto max-w-[1320px] px-6 py-10 md:px-10">
        <header className="mb-8 rounded-3xl border border-[#e7eef8] bg-white p-7 md:p-8 backdrop-blur-xl">
          <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Perp Market Intelligence</h1>
          <p className="mt-3 max-w-3xl text-slate-500">실시간 TVL·볼륨 흐름을 시각적으로 빠르게 확인하세요.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#d7e8ff] bg-[#f1f7ff] px-3 py-1 text-xs text-[#2563eb]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> LIVE
            <span className="text-slate-500">· 5초 자동 갱신</span>
            <span className="text-slate-500">· 마지막 업데이트 {secondsSinceUpdate == null ? '-' : `${secondsSinceUpdate}s 전`}</span>
            <span className="text-slate-500">· 다음 갱신 {Math.max(0, Math.ceil((nextRefreshAt - nowTs) / 1000))}s</span>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#dbe8ff] bg-white p-6 backdrop-blur">
            <p className="text-xs text-slate-500">Total TVL</p>
            <p className="mt-2 text-3xl font-semibold">{money(total)}</p>
          </div>
          <div className="rounded-2xl border border-[#dbe8ff] bg-white p-6 backdrop-blur">
            <p className="text-xs text-slate-500">Tracked Exchanges</p>
            <p className="mt-2 text-3xl font-semibold">{dexRows.length}</p>
          </div>
        </section>

        <div className="mb-6 inline-flex rounded-2xl border border-[#dbe8ff] bg-white p-1">
          <button onClick={() => setActiveTab('all')} className={`rounded-lg px-4 py-2 text-sm ${activeTab==='all'?'bg-[#3182f6] text-white':'text-slate-500'}`}>All</button>
          <button onClick={() => setActiveTab('exchanges')} className={`rounded-lg px-4 py-2 text-sm ${activeTab==='exchanges'?'bg-[#3182f6] text-white':'text-slate-500'}`}>Exchanges</button>
          <button onClick={() => setActiveTab('coins')} className={`rounded-lg px-4 py-2 text-sm ${activeTab==='coins'?'bg-[#3182f6] text-white':'text-slate-500'}`}>Coins</button>
        </div>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          {activeTab !== 'coins' && (
          <div className="xl:col-span-3 rounded-[28px] border border-[#e6edf7] bg-white p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Exchange Cards</h2>
            {loading && <div className="text-slate-400">Loading...</div>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {!loading &&
                dexRows.map((r) => {
                  return (
                  <button
                    key={`${r.name}-${r.link}`}
                    className="group rounded-3xl border border-[#e6edf7] bg-[#f8fbff] p-5 text-left transition hover:-translate-y-1 hover:border-[#bfd7ff] hover:shadow-[0_10px_24px_rgba(37,99,235,0.12)]"
                    onClick={() => window.open(r.link, '_blank', 'noopener,noreferrer')}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-xl font-extrabold tracking-tight">{r.name}</p>
                      <span className="rounded-full border border-[#cfe1ff] bg-[#eef5ff] px-3 py-1 text-xs text-[#2563eb]">Open ↗</span>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white p-3">
                        <p className="text-[11px] text-slate-400">TVL</p>
                        <p className="mt-1 text-base font-semibold"><span>{r.tvl > 0 ? money(r.tvl) : '-'}</span></p>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <p className="text-[11px] text-slate-400">24H Vol</p>
                        <p className="mt-1 text-base font-semibold"><span>{r.volume24h != null && r.volume24h > 0 ? money(r.volume24h) : '-'}</span></p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-slate-400">Momentum</span>
                        <span className={r.d1 != null && r.d1 >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-500 font-semibold'}>
                          <span>{`${p(r.d1)} / ${p(r.d7)}`}</span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#eaf1fb]">
                        <div
                          className={`h-2 rounded-full ${r.d1 != null && r.d1 >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.min(100, Math.max(12, Math.abs((r.d1 ?? 0) * 3)))}%` }}
                        />
                      </div>
                    </div>
                  </button>
                  );
                })}
            </div>
          </div>
          )}

          {activeTab !== 'exchanges' && (
          <div className="xl:col-span-2 rounded-[28px] border border-[#e6edf7] bg-white p-6 backdrop-blur-xl">
            <h2 className="mb-5 text-xl font-semibold">Coin Pulse</h2>
            <div className="space-y-3">
              {coinRows.map((c) => (
                <div key={c.id} className="rounded-2xl border border-[#e6edf7] bg-[#f8fbff] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-base">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.symbol} · {c.source.toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money(c.price)}</p>
                      <p className={c.change24h >= 0 ? 'text-emerald-600 text-sm font-semibold' : 'text-rose-500 text-sm font-semibold'}>{p(c.change24h)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </section>
      </div>
    </main>
  );
}
