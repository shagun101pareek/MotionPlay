import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold tracking-wide transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-accent text-white hover:bg-[#a99bff]',
        variant === 'ghost' && 'border border-white/15 bg-transparent text-foam hover:border-white/35',
        className,
      )}
      {...props}
    />
  );
}
