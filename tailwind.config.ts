import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        night: "rgb(var(--bg-rgb) / <alpha-value>)",
        deck: "rgb(var(--deck-rgb) / <alpha-value>)",
        deck2: "rgb(var(--deck-2-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        line2: "rgb(var(--line-2-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        mute: "rgb(var(--mute-rgb) / <alpha-value>)",
        dim: "rgb(var(--dim-rgb) / <alpha-value>)",
        off: "rgb(var(--off-rgb) / <alpha-value>)",
        def: "rgb(var(--def-rgb) / <alpha-value>)",
        hot: "rgb(var(--hot-rgb) / <alpha-value>)",
        win: "rgb(var(--win-rgb) / <alpha-value>)",
        loss: "rgb(var(--loss-rgb) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Archivo Variable'", "system-ui", "sans-serif"],
        sans: ["'Archivo Variable'", "system-ui", "sans-serif"],
      },
      screens: { xs: "420px" },
    },
  },
  plugins: [],
};
export default config;
