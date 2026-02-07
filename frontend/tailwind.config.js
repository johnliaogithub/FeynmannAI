/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0ea5a3',
          600: '#089189',
          700: '#056b61'
        },
        panel: '#f8fafc',
        subtle: '#475569'
      }
    },
  },
  plugins: [],
}
