/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fefce8",
          100: "#fef9c3",
          200: "#fef08a",
          300: "#fde047",
          400: "#facc15", // Brand Primary (Brand Amber)
          500: "#eab308", // Brand Hover
          600: "#ca8a04",
          700: "#a16207",
          800: "#854d0e",
          900: "#713f12",
        },
        surface: {
          bgDark: "#121316",   // Dark Page Background
          cardDark: "#18191e", // Dark Bento Box
          subDark: "#1d1e24",  // Dark Sub-card
          bgLight: "#fbfbfb",  // Light Page Background
          cardLight: "#ffffff",// Light Bento Box
          subLight: "#f8f9fa", // Light Sub-card
        },
      },
      borderRadius: {
        "bento": "28px",
        "card": "20px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
