/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        indigo: {
          900: '#1B2A4A',
          800: '#2A3F6A',
          700: '#3A548A',
          100: '#EBF0F7',
          50: '#F4F6F9',
        },
        amber: {
          500: '#F5A623',
          400: '#F7B84E',
          600: '#D4891A',
        },
        mint: {
          500: '#34C759',
          100: '#E8F8ED',
        },
        coral: {
          500: '#FF3B30',
          100: '#FFEFEE',
        },
      },
      fontFamily: {
        serif: ['Noto Serif SC', 'serif'],
        sans: ['Noto Sans SC', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
