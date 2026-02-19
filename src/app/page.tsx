'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type HistoricalPoint = { date: number; totalLiquidityUSD: number };
type ProtocolData = {
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

    const preferredKeys = [
      'tvl',
      'totalLiquidityUSD',
      'usd',
      'value',
      'amount',
    ];

    for (const key of preferredKeys) {
      if (key in obj) {
        const n = toNumber(obj[key]);
        if (n > 0) return n;
      }
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
      const date = toNumber((item as Record<string, unknown>)?.date);
      const totalLiquidityUSD = toNumber(
        (item as Record<string, unknown>)?.totalLiquidityUSD ??
          (item as Record<string, unknown>)?.tvl,
      );
      return { date, totalLiquidityUSD };
    })
    .filter((d) => d.date > 0 && d.totalLiquidityUSD >= 0);
}

export default function Home() {
  const [data, setData] = useState<ProtocolData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const dexes = ['gmx', 'dydx', 'apex-protocol'];

      const promises = dexes.map(async (dex) => {
        try {
          const response = await axios.get(`https://api.llama.fi/protocol/${dex}`);
          const protocol = response.data as Record<string, unknown>;

          const chainTvls = normalizeChainTvls(protocol.currentChainTvls);
          const firstChain = Object.keys(chainTvls)[0];
          const historicalRaw =
            (protocol.chainTvls as Record<string, { tvl?: unknown }>)?.[firstChain]?.tvl ?? [];

          return {
            name: String(protocol.name ?? dex),
            tvl: toNumber(protocol.tvl),
            chainTvls,
            historicalTvl: normalizeHistorical(historicalRaw),
          } satisfies ProtocolData;
        } catch (error) {
          console.error(`Error fetching ${dex}:`, error);
          return null;
        }
      });

      const results = (await Promise.all(promises)).filter(Boolean) as ProtocolData[];
      setData(results);
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-white text-gray-800 p-8">
      <h1 className="text-3xl font-bold text-center mb-8 text-blue-600">Perpetual DEX Stats</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.map((protocol) => (
          <div key={protocol.name} className="bg-white shadow-md rounded-lg p-6 border border-blue-200">
            <h2 className="text-xl font-semibold mb-4 text-blue-500">{protocol.name}</h2>
            <div className="mb-4">
              <p>
                <strong>TVL:</strong> ${protocol.tvl.toLocaleString()}
              </p>
              <table className="w-full mt-2 border-collapse">
                <thead>
                  <tr>
                    <th className="border px-2 py-1 text-left">Chain</th>
                    <th className="border px-2 py-1 text-right">TVL</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(protocol.chainTvls).map(([chain, tvl]) => (
                    <tr key={chain}>
                      <td className="border px-2 py-1">{chain}</td>
                      <td className="border px-2 py-1 text-right">${tvl.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={protocol.historicalTvl.map((d) => ({
                    date: new Date(d.date * 1000).toLocaleDateString(),
                    tvl: d.totalLiquidityUSD,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="tvl" stroke="#007bff" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
