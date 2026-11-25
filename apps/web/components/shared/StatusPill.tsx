import { cn } from '@/lib/cn';

export function StatusPill({
  live,
  children,
}: {
  live: boolean;
  children: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-navy px-3 py-1.5 text-xs tracking-wide text-mist">
      <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-accent shadow-glow' : 'bg-mist')} />
      <span className={live ? 'text-foam' : undefined}>{children}</span>
    </span>
  );
}
