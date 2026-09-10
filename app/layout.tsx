import type { Metadata } from 'next';
import { Geist, Geist_Mono, Klee_One } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const handwriting = Klee_One({
  variable: '--font-hand',
  weight: ['400', '600'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'learnAnything · 二分查找动态课',
  description: '一堂把语音、动态板书与概念动画锁定在同一时间轴上的 87 秒微课。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${handwriting.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
