import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#16a34a', dark: '#15803d' },
        accent: { DEFAULT: '#ea580c', dark: '#c2410c' },
      },
      boxShadow: { card: '0 1px 3px rgba(15,23,42,0.08)' },
    },
  },
  plugins: [],
};

export default config;
