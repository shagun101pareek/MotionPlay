import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#07080d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ControllerLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh overflow-hidden">{children}</div>;
}
