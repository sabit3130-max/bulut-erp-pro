/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#17202a',
        line: '#d9e1e8',
        ocean: '#126c82',
        mint: '#d7f2ea',
        saffron: '#e5a526',
        rose: '#b9415a',
      },
      boxShadow: {
        panel: '0 18px 50px rgb(23 32 42 / 0.08)',
        soft: '0 8px 24px rgb(15 23 42 / 0.06)',
        lift: '0 22px 70px rgb(15 23 42 / 0.12)',
      },
    },
  },
  plugins: [],
};
