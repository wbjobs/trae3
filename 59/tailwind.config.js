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
        'deep-blue': '#0A1628',
        'steel-gray': '#1E293B',
        'neon-cyan': '#00F0FF',
        'amber-warn': '#FF8C00',
        'green-ok': '#00E676',
        'red-alert': '#FF1744',
        'panel-bg': 'rgba(30, 41, 59, 0.85)',
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Source Sans 3', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'border-flash': 'borderFlash 1s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        borderFlash: {
          '0%, 100%': { borderColor: 'rgba(255, 23, 68, 0.3)' },
          '50%': { borderColor: 'rgba(255, 23, 68, 1)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
