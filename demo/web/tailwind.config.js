/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#070708',
        surface: '#0f0f12',
        'surface-raised': '#16161c',
        'surface-inset': '#050506',
        line: 'rgba(255, 255, 255, 0.08)',
        'line-strong': 'rgba(255, 255, 255, 0.14)',
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          muted: 'rgba(99, 102, 241, 0.14)',
        },
        success: {
          DEFAULT: '#34d399',
          muted: 'rgba(52, 211, 153, 0.12)',
        },
        danger: {
          DEFAULT: '#fb7185',
          muted: 'rgba(251, 113, 133, 0.12)',
        },
        warn: {
          DEFAULT: '#fbbf24',
          muted: 'rgba(251, 191, 36, 0.12)',
        },
        muted: '#71717a',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel:
          '0 0 0 1px rgba(255,255,255,0.03) inset, 0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -32px rgba(0,0,0,0.85)',
        glow: '0 0 0 1px rgba(99,102,241,0.22), 0 12px 40px -16px rgba(99,102,241,0.55)',
      },
    },
  },
  plugins: [],
};
