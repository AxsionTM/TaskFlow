import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'TaskFlow — планируй. выполняй. развивайся.',
  description: 'TaskFlow — единое пространство для задач, проектов, привычек, целей и фокус-режима.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'TaskFlow',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#070a12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={["light", "dark", "ocean", "forest", "crimson", "violet", "black"]}>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
