import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PerpDEX 토스 스타일 비교 대시보드',
  description: '주요 Perp DEX 프로토콜 TVL과 추세를 토스 UI 스타일로 비교하는 웹사이트',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
