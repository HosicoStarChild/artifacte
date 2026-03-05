import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: "#0a0a0f",
          800: "#141419",
          700: "#1a1a1f",
          600: "#242429",
        },
        gold: {
          400: "#d4a843",
          500: "#C9A55C",
          600: "#b8860b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
      },
      fontSize: {
        "hero": ["3.5rem", { lineHeight: "1.1" }],
        "section": ["2.5rem", { lineHeight: "1.1" }],
      },
    },
  },
  plugins: [],
};
export default config;
