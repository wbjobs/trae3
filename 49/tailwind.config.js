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
        'pipeline-cyan': '#00e5ff',
        'pipeline-dark': '#0a1628',
        'pipeline-alarm': '#ff3d00',
        'pipeline-warn': '#ffa726',
        'pipeline-ok': '#4caf50',
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        body: ['Noto Sans SC', 'sans-serif'],
      },
      animation: {
        'pulse-alarm': 'pulse-alarm 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-alarm': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }: any) {
      addUtilities({
        '.performance-mode': {
          filter: 'grayscale(0.3) contrast(0.9)',
        },
        '.performance-mode *': {
          transition: 'none !important',
        },
      })
    },
  ],
};
