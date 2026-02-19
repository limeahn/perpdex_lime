import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '웹사이트 시작 템플릿',
  description: '웹사이트를 빠르게 만들 수 있는 Next.js 기반 시작 템플릿',
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
