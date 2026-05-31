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
        "military-green": "#2D4A22",
        "military-green-light": "#3D6A32",
        "military-green-dark": "#1E3516",
        sand: "#C4A35A",
        "sand-light": "#D4B86A",
        "sand-dark": "#A48A3A",
        charcoal: "#1A1A2E",
        "charcoal-light": "#25253F",
        "charcoal-dark": "#0F0F1E",
        "faction-red": "#C62828",
        "faction-red-light": "#E53935",
        "faction-red-dark": "#8E0000",
        "faction-blue": "#1565C0",
        "faction-blue-light": "#1E88E5",
        "faction-blue-dark": "#0D47A1",
        "amber-warn": "#FF8F00",
        "amber-warn-light": "#FFA726",
        surface: "#16213E",
        "surface-light": "#1F2B47",
        border: "#2A3A5C",
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
      },
      borderRadius: {
        military: "2px",
      },
      boxShadow: {
        pressed: "inset 0 2px 4px rgba(0,0,0,0.5)",
        glow: "0 0 10px rgba(196,163,90,0.4)",
        "glow-red": "0 0 10px rgba(198,40,40,0.4)",
        "glow-blue": "0 0 10px rgba(21,101,192,0.4)",
      },
    },
  },
  plugins: [],
};
