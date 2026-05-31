/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ops-dark': '#0f172a',
        'ops-card': '#1e293b',
        'ops-border': '#334155',
        'ops-accent': '#06d6a0',
        'ops-warning': '#f59e0b',
        'ops-critical': '#ef4444',
        'ops-text': '#e2e8f0',
        'ops-muted': '#64748b',
      },
      fontFamily: {
        mono: ['"SF Mono"', '"Cascadia Code"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(6, 214, 160, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(6, 214, 160, 0.6)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
