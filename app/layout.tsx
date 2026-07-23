import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Gaegu } from "next/font/google";
import Providers from "./components/Providers";

const gaegu = Gaegu({ weight: ['400', '700'], subsets: ['latin'], display: 'swap', variable: '--font-gaegu' });

export const metadata: Metadata = {
  title: "아기의 밥상",
  description: "아기의 발육·발달단계 평가로 이유식 재료와 레시피를 추천하고 냉장고 재고를 관리하는 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full ${gaegu.variable}`}>
      <body className="h-full" suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
