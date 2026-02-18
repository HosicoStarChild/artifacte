import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0a0e1a",
          800: "#0f1628",
          700: "#162036",
          600: "#1c2a44",
        },
        gold: {
          400: "#d4a843",
          500: "#c9952c",
          600: "#b8860b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
