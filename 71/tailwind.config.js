export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: { center: true },
    extend: {
      colors: {
        inv: {
          bg: '#0F172A',
          card: '#1E293B',
          border: '#334155',
          primary: '#06B6D4',
          online: '#22C55E',
          warning: '#F59E0B',
          fault: '#EF4444',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
