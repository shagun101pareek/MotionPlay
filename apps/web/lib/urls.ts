import { DEFAULT_SOCKET_PORT } from '@motionplay/shared';

export function getServerBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  const port = process.env.NEXT_PUBLIC_SOCKET_PORT || String(DEFAULT_SOCKET_PORT);
  if (typeof window === 'undefined') return `http://127.0.0.1:${port}`;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${port}`;
}

export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function controllerUrl(roomId: string, lanOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_PUBLIC_ORIGIN?.replace(/\/$/, '');
  if (configured) return `${configured}/controller/${roomId}`;
  if (typeof window === 'undefined') return `/controller/${roomId}`;
  if (lanOrigin && isLocalHostname(window.location.hostname)) return `${lanOrigin}/controller/${roomId}`;
  return `${window.location.origin}/controller/${roomId}`;
}
