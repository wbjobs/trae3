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
        primary: {
          DEFAULT: '#0F2B46',
          light: '#1A3A5C',
          dark: '#0A1E33',
        },
        accent: {
          DEFAULT: '#00D4AA',
          light: '#33DDBB',
          dark: '#00A888',
        },
        'alert-blue': '#3B82F6',
        'alert-yellow': '#F59E0B',
        'alert-orange': '#F97316',
        'alert-red': '#EF4444',
      },
      fontFamily: {
        display: ['"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
