import type { Config } from 'tailwindcss';

/** Charte ALLÔ-COURSIER : bleu profond, bleu clair, blanc, touche de vert. */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0B2A5B', // bleu profond
          dark: '#071C3E',
          light: '#2F80ED', // bleu clair
          sky: '#EAF2FE',
          green: '#1DB954', // accent vert
          greenDark: '#138A3E',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(11,42,91,0.08), 0 4px 16px rgba(11,42,91,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
