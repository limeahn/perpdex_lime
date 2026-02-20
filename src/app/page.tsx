'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolRow = {
  slug?: string;
  name: string;
  tvl: number;
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

export default function Home() {
  const [dexRows, setDexRows] = useState<ProtocolRow[]>([]);
  const [coinRows, setCoinRows] = useState<CoinRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const [dexSettled, geckoRes, cmcRes] = await Promise.all([
        Promise.allSettled(
          DEXES.map(async (dex) => {
            if (!dex.slug) {
              return { name: dex.name, tvl: 0, d1: null, d7: null, link: dex.link } as ProtocolRow;
            }
            const res = await axios.get(`https://api.llama.fi/protocol/${dex.slug}`);
            const hist = normalizeHistorical((res.data as any).tvl);
            const tvl = hist.length ? hist[hist.length - 1].totalLiquidityUSD : 0;
            return {
              slug: dex.slug,
              name: (res.data as any).name ?? dex.name,
              tvl,
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
      ]);

      const dex = dexSettled
        .filter((r): r is PromiseFulfilledResult<ProtocolRow> => r.status === 'fulfilled')
        .map((r) => r.value)
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
      setCoinRows([...cmc, ...gecko].slice(0, 10));
      setLoading(false);
    };
    run();
  }, []);

  const total = useMemo(() => dexRows.reduce((s, r) => s + r.tvl, 0), [dexRows]);

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100">
      <div className="mx-auto max-w-[1280px] px-6 py-10 md:px-10">
        <div className="mb-8 rounded-3xl border border-[#1c2433] bg-[#0d1423] px-7 py-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#67a2ff]">Exchanges</p>
          <h1 className="mt-3 text-4xl font-semibold">Perpetual Exchanges Overview</h1>
          <p className="mt-3 text-slate-400">다크 테마 기반의 거래소 데이터 보드</p>
        </div>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#1f2a3b] bg-[#0c1220] p-6">
            <p className="text-xs text-slate-400">Total TVL</p>
            <p className="mt-2 text-3xl font-semibold">{money(total)}</p>
          </div>
          <div className="rounded-2xl border border-[#1f2a3b] bg-[#0c1220] p-6">
            <p className="text-xs text-slate-400">Tracked Exchanges</p>
            <p className="mt-2 text-3xl font-semibold">{dexRows.length}</p>
          </div>
          <div className="rounded-2xl border border-[#1f2a3b] bg-[#0c1220] p-6">
            <p className="text-xs text-slate-400">Top Exchange</p>
            <p className="mt-2 text-3xl font-semibold">{dexRows[0]?.name ?? '-'}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-3xl border border-[#1f2a3b] bg-[#0b111d] p-6">
            <h2 className="mb-5 text-xl font-semibold">Perp Exchange Table</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[#1f2a3b] text-slate-400">
                  <tr>
                    <th className="py-3 text-left">Exchange</th>
                    <th className="py-3 text-right">TVL</th>
                    <th className="py-3 text-right">1D</th>
                    <th className="py-3 text-right">7D</th>
                    <th className="py-3 text-right">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="py-6 text-slate-500" colSpan={5}>Loading...</td>
                    </tr>
                  )}
                  {!loading &&
                    dexRows.map((r) => (
                      <tr
                        key={`${r.name}-${r.link}`}
                        className="border-b border-[#141c2a] cursor-pointer hover:bg-[#111a2a]"
                        onClick={() => window.open(r.link, '_blank', 'noopener,noreferrer')}
                      >
                        <td className="py-4 font-medium">{r.name}</td>
                        <td className="py-4 text-right">{r.tvl > 0 ? money(r.tvl) : '-'}</td>
                        <td className={`py-4 text-right ${r.d1 != null && r.d1 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{p(r.d1)}</td>
                        <td className={`py-4 text-right ${r.d7 != null && r.d7 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{p(r.d7)}</td>
                        <td className="py-4 text-right text-[#67a2ff]">Open ↗</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-3xl border border-[#1f2a3b] bg-[#0b111d] p-6">
            <h2 className="mb-5 text-xl font-semibold">Coin Market</h2>
            <div className="space-y-3">
              {coinRows.map((c) => (
                <div key={c.id} className="rounded-xl border border-[#1b2536] bg-[#0f1626] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {c.symbol} · {c.source.toUpperCase()}
                      </p>
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
