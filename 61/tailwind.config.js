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
        "dark-bg": "#0d1117",
        "dark-card": "#161b22",
        "dark-border": "#30363d",
        accent: "#00d2ff",
        "accent-blue": "#0f3460",
        "status-online": "#2ed573",
        "status-offline": "#6b7280",
        "status-alarm": "#ff4757",
        "status-warning": "#ffa502",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
