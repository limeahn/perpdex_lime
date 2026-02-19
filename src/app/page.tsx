import styles from './page.module.css';

const features = [
  {
    title: '빠른 시작',
    description: '원하는 서비스 소개 페이지를 하루 안에 만들 수 있도록 구성했어요.',
  },
  {
    title: '모바일 최적화',
    description: '스마트폰·태블릿·데스크톱에서 모두 깔끔하게 보이도록 반응형으로 제작했습니다.',
  },
  {
    title: '간단한 커스터마이징',
    description: '문구와 색상만 바꿔도 나만의 브랜드 사이트로 바로 활용할 수 있습니다.',
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.badge}>Starter Website</p>
          <h1>웹사이트를 만들고 싶다면, 여기서 시작하세요.</h1>
          <p>
            이 템플릿은 서비스 소개, 포트폴리오, 개인 프로젝트 랜딩 페이지로 바로 활용할 수 있게
            구성되어 있습니다.
          </p>
          <div className={styles.actions}>
            <a href="#features" className={styles.primary}>
              기능 보기
            </a>
            <a href="https://nextjs.org/docs" target="_blank" rel="noreferrer" className={styles.secondary}>
              Next.js 문서
            </a>
          </div>
        </section>

        <section id="features" className={styles.features}>
          {features.map((feature) => (
            <article key={feature.title} className={styles.card}>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
