import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './games/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07080d',
        navy: '#101626',
        panel: '#171e30',
        mist: '#93a0b8',
        foam: '#f4f1ea',
        accent: '#8d7bff',
        signal: '#3ec6ff',
        danger: '#ff5d73',
        warn: '#e6b450',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 32px rgba(141, 123, 255, 0.28)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.45s ease',
      },
    },
  },
  plugins: [],
};

export default config;
