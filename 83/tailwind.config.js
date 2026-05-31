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
          50: "#F5F1E8",
          100: "#E8DFD0",
          200: "#D4C4A8",
          300: "#B89F78",
          400: "#9C7A4A",
          500: "#8B5A2B",
          600: "#7A4A1F",
          700: "#6B3D17",
          800: "#5D4037",
          900: "#3E2723",
        },
        accent: {
          50: "#FFF8E1",
          100: "#FFECB3",
          200: "#FFE082",
          300: "#FFD54F",
          400: "#FFCA28",
          500: "#D4AF37",
          600: "#C9A227",
          700: "#B8860B",
          800: "#8B6914",
          900: "#6B4F12",
        },
        ink: {
          50: "#F7F6F3",
          100: "#E8E6E1",
          200: "#D3D0C8",
          300: "#B5B0A5",
          400: "#8E8878",
          500: "#6B6556",
          600: "#4A4538",
          700: "#2F2C24",
          800: "#1A1814",
          900: "#0D0C0A",
        },
        paper: "#F5F1E8",
        seal: "#C41E3A",
      },
      fontFamily: {
        serif: ["Noto Serif SC", "Source Han Serif SC", "SimSun", "serif"],
        sans: ["Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "sans-serif"],
      },
      boxShadow: {
        "ink": "0 4px 20px rgba(0, 0, 0, 0.15)",
        "paper": "0 2px 8px rgba(93, 64, 55, 0.1)",
        "seal": "0 0 0 3px rgba(196, 30, 58, 0.3)",
      },
      backgroundImage: {
        "paper-texture": "url('data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"%3E%3Cfilter id=\"noise\"%3E%3CfeTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"4\" stitchTiles=\"stitch\"/%3E%3C/filter%3E%3Crect width=\"100\" height=\"100\" filter=\"url(%23noise)\" opacity=\"0.03\"/%3E%3C/svg%3E')",
        "ink-wash": "linear-gradient(135deg, rgba(93,64,55,0.02) 0%, rgba(93,64,55,0.08) 100%)",
      },
      animation: {
        "scroll-reveal": "scrollReveal 0.8s ease-out forwards",
        "ink-spread": "inkSpread 0.6s ease-out forwards",
        "page-flip": "pageFlip 0.5s ease-out forwards",
      },
      keyframes: {
        scrollReveal: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        inkSpread: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "50%": { transform: "scale(1.1)", opacity: "0.8" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pageFlip: {
          "0%": { transform: "rotateY(-90deg)", opacity: "0" },
          "100%": { transform: "rotateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
