import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: {
          black: '#0B0B0B',
          ink: '#151515',
          coal: '#1F1F1F',
          gold: '#D4AF37',
          'gold-dark': '#B8902A',
          'gold-light': '#F3E7C3',
          cream: '#FBF8EF',
        },
      },
      fontFamily: { display: ['Georgia', 'Cambria', 'serif'] },
      boxShadow: { card: '0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.06)' },
    },
  },
  plugins: [],
} satisfies Config;
