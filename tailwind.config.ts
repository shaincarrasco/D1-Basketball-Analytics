import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        night: "var(--bg)",
        deck: "var(--deck)",
        deck2: "var(--deck-2)",
        line: "var(--line)",
        line2: "var(--line-2)",
        ink: "var(--ink)",
        mute: "var(--mute)",
        dim: "var(--dim)",
        off: "var(--off)",
        def: "var(--def)",
        hot: "var(--hot)",
        win: "var(--win)",
        loss: "var(--loss)",
      },
      fontFamily: {
        display: ["'Big Shoulders Display Variable'", "Impact", "sans-serif"],
        sans: ["Barlow", "system-ui", "sans-serif"],
      },
      screens: { xs: "420px" },
    },
  },
  plugins: [],
};
export default config;
