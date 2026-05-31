/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,vue}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        primary: {
          50: '#E3F2FD',
          100: '#BBDEFB',
          200: '#90CAF9',
          300: '#64B5F6',
          400: '#42A5F5',
          500: '#1E3A5F',
          600: '#1A3354',
          700: '#152944',
          800: '#0F1E33',
          900: '#0A1422',
        },
        accent: {
          50: '#E0F7FF',
          100: '#B3ECFF',
          200: '#80E0FF',
          300: '#4DD4FF',
          400: '#26CAFF',
          500: '#00D4FF',
          600: '#00B8E6',
          700: '#0099CC',
          800: '#007AB3',
          900: '#005C99',
        },
        success: '#00C853',
        warning: '#FFD600',
        danger: '#FF1744',
        info: '#2979FF',
        dark: {
          bg: '#0F1419',
          card: '#1A2332',
          border: '#2A3441',
          text: '#E4E7EB',
          textSecondary: '#8492A6',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        sans: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 212, 255, 0.3)',
        card: '0 4px 20px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        breathe: 'breathe 3s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        }
      }
    },
  },
  plugins: [],
};
