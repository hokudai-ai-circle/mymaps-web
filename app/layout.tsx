import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import { AppProvider } from '@/store/AppContext';
import './globals.css';

const notoSansJP = Noto_Sans_JP({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'NoMaps fan app',
  description:
    'NoMaps（札幌の多産業クリエイティブ・カンファレンス）の非公式ファンアプリ。会場間の移動時間を考慮して、あなたの予定が本当に間に合うかを確認できます。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
