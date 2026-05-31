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
        'bg-primary': '#0a0f1a',
        'bg-card': '#1a2332',
        'bg-body': '#0d1320',
        'border-default': '#2d3a4a',
        'text-primary': '#e8ecf1',
        'text-secondary': '#8b95a5',
        'accent': '#00e5a0',
        'warning': '#ff6b35',
        'critical': '#ff3b5c',
        'fault': '#ff0040',
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        body: ['Noto Sans SC', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 229, 160, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(0, 229, 160, 0.6)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
