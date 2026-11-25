import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit, Syne } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'MotionPlay',
    template: '%s · MotionPlay',
  },
  description: 'Your phone. Your movement. Your game. MotionPlay is a racket-sports console controlled by a phone.',
};

export const viewport: Viewport = {
  themeColor: '#07080d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${mono.variable} ${display.variable}`}>
      <body className="bg-ink font-sans text-foam antialiased">{children}</body>
    </html>
  );
}
