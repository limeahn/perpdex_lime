'use client';

import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './page.module.css';

type HistoricalPoint = {
  date: number;
  totalLiquidityUSD: number;
};

type ProtocolCard = {
  slug: string;
  name: string;
  tvl: number;
  change7d: number;
  chains: Array<{ name: string; tvl: number }>;
  chart: Array<{ date: string; tvl: number }>;
};

type TargetProtocol = {
  label: string;
  slugCandidates: string[];
  nameIncludes?: string[];
};

type ProtocolCatalogItem = {
  slug?: string;
  name?: string;
};

const TARGET_PROTOCOLS: TargetProtocol[] = [
  { label: 'GMX', slugCandidates: ['gmx'] },
  { label: 'dYdX', slugCandidates: ['dydx'] },
  { label: 'ApeX', slugCandidates: ['apex-protocol'] },
  { label: 'SynFutures', slugCandidates: ['synfutures-v3'] },
  {
    label: 'Backpack',
    slugCandidates: ['backpack', 'backpack-exchange'],
    nameIncludes: ['backpack'],
  },
  {
    label: 'Ostium',
    slugCandidates: ['ostium', 'ostium-protocol'],
    nameIncludes: ['ostium'],
  },
  {
    label: 'Extended',
    slugCandidates: ['extended', 'extended-exchange'],
    nameIncludes: ['extended'],
  },
  {
    label: 'Pacifica',
    slugCandidates: ['pacifica', 'pacifica-markets'],
    nameIncludes: ['pacifica'],
  },
];

function resolveProtocolSlug(target: TargetProtocol, catalog: ProtocolCatalogItem[]) {
  const fromCandidates = target.slugCandidates.find((candidate) =>
    catalog.some((item) => item.slug?.toLowerCase() === candidate.toLowerCase()),
  );

  if (fromCandidates) return fromCandidates;

  if (target.nameIncludes?.length) {
    const byName = catalog.find((item) => {
      const name = item.name?.toLowerCase() ?? '';
      return target.nameIncludes?.some((keyword) => name.includes(keyword.toLowerCase()));
    });
    if (byName?.slug) return byName.slug;
  }

  return target.slugCandidates[0];
}

const formatUsd = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'USD',
    notation: value > 1_000_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 0,
  }).format(value);

function extractChainTvls(currentChainTvls: Record<string, unknown> | undefined) {
  if (!currentChainTvls) return [] as Array<{ name: string; tvl: number }>;

  return Object.entries(currentChainTvls)
    .map(([name, raw]) => {
      if (typeof raw === 'number') return { name, tvl: raw };
      if (raw && typeof raw === 'object' && 'tvl' in raw && typeof raw.tvl === 'number') {
        return { name, tvl: raw.tvl };
      }
      return { name, tvl: 0 };
    })
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 4);
}

function getChange7d(history: HistoricalPoint[]) {
  if (history.length < 8) return 0;
  const latest = history[history.length - 1]?.totalLiquidityUSD ?? 0;
  const previous = history[Math.max(0, history.length - 8)]?.totalLiquidityUSD ?? 0;
  if (!previous) return 0;
  return ((latest - previous) / previous) * 100;
}

export default function Home() {
  const [items, setItems] = useState<ProtocolCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        let catalog: ProtocolCatalogItem[] = [];
        try {
          const catalogRes = await fetch('https://api.llama.fi/protocols');
          if (catalogRes.ok) {
            const catalogData = await catalogRes.json();
            if (Array.isArray(catalogData)) {
              catalog = catalogData;
            }
          }
        } catch {
          catalog = [];
        }

        const responses = await Promise.allSettled(
          TARGET_PROTOCOLS.map(async (target) => {
            const slug = resolveProtocolSlug(target, catalog);
            const res = await fetch(`https://api.llama.fi/protocol/${slug}`);
            if (!res.ok) throw new Error(`${target.label} 응답 실패`);
            const data = await res.json();

            const history: HistoricalPoint[] = Array.isArray(data.chainTvls?.[Object.keys(data.chainTvls ?? {})[0]]?.tvl)
              ? data.chainTvls[Object.keys(data.chainTvls)[0]].tvl
              : [];

            return {
              slug,
              name: data.name ?? target.label,
              tvl: Number(data.tvl ?? 0),
              change7d: getChange7d(history),
              chains: extractChainTvls(data.currentChainTvls),
              chart: history.slice(-30).map((point: HistoricalPoint) => ({
                date: new Date(point.date * 1000).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
                tvl: point.totalLiquidityUSD,
              })),
            } as ProtocolCard;
          }),
        );

        const fulfilled = responses
          .filter((response): response is PromiseFulfilledResult<ProtocolCard> => response.status === 'fulfilled')
          .map((response) => response.value)
          .sort((a, b) => b.tvl - a.tvl);

        if (!fulfilled.length) {
          throw new Error('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }

        setItems(fulfilled);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '알 수 없는 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const totalTvl = useMemo(() => items.reduce((acc, item) => acc + item.tvl, 0), [items]);
  const avgChange = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((acc, item) => acc + item.change7d, 0) / items.length;
  }, [items]);

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>PerpDEX Compare</p>
          <h1>토스 스타일로 보는 Perp DEX 비교 대시보드</h1>
          <p>
            기존 PerpDEX 데이터 구조를 활용해 주요 프로토콜 TVL, 7일 추세, 체인별 점유를 한 눈에 볼 수 있게
            재구성했습니다.
          </p>
        </section>

        {isLoading ? <section className={styles.notice}>데이터를 불러오는 중...</section> : null}
        {error ? <section className={styles.error}>{error}</section> : null}

        {!isLoading && !error ? (
          <>
            <section className={styles.summaryGrid}>
              <article className={styles.summaryCard}>
                <h2>비교 대상 프로토콜</h2>
                <strong>{items.length}개</strong>
              </article>
              <article className={styles.summaryCard}>
                <h2>합산 TVL</h2>
                <strong>{formatUsd(totalTvl)}</strong>
              </article>
              <article className={styles.summaryCard}>
                <h2>평균 7일 변동률</h2>
                <strong className={avgChange >= 0 ? styles.positive : styles.negative}>{avgChange.toFixed(2)}%</strong>
              </article>
            </section>

            <section className={styles.protocolList}>
              {items.map((protocol) => (
                <article key={protocol.slug} className={styles.protocolCard}>
                  <div className={styles.cardTop}>
                    <div>
                      <h3>{protocol.name}</h3>
                      <p>{formatUsd(protocol.tvl)}</p>
                    </div>
                    <span className={protocol.change7d >= 0 ? styles.positiveBadge : styles.negativeBadge}>
                      7일 {protocol.change7d >= 0 ? '+' : ''}
                      {protocol.change7d.toFixed(2)}%
                    </span>
                  </div>

                  <ul className={styles.chainList}>
                    {protocol.chains.map((chain) => (
                      <li key={`${protocol.slug}-${chain.name}`}>
                        <span>{chain.name}</span>
                        <strong>{formatUsd(chain.tvl)}</strong>
                      </li>
                    ))}
                  </ul>

                  <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={protocol.chart}>
                        <Tooltip labelStyle={{ color: '#64748b' }} />
                        <Line type="monotone" dataKey="tvl" stroke="#3182f6" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
