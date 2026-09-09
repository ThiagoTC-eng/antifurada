import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          500: "#0b78dd",
          600: "#0862b3",
          700: "#064e8f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
