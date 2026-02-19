import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ProtocolData {
  name: string;
  tvl: number;
  chainTvls: { [key: string]: number };
  historicalTvl: { date: number; totalLiquidityUSD: number }[];
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
          const protocol = response.data;
          return {
            name: protocol.name,
            tvl: protocol.tvl,
            chainTvls: protocol.currentChainTvls,
            historicalTvl: protocol.chainTvls?.[Object.keys(protocol.currentChainTvls)[0]]?.tvl || [],
          };
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
              <p><strong>TVL:</strong> ${protocol.tvl.toLocaleString()}</p>
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
                      <td className="border px-2 py-1 text-right">${(tvl as number).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={protocol.historicalTvl.map(d => ({ date: new Date(d.date * 1000).toLocaleDateString(), tvl: d.totalLiquidityUSD }))}>
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