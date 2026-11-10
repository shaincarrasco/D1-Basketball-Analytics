import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {
    colors: {
      ink: "#080d18", panel: "#101827", line: "#223047",
      muted: "#8fa0b8", accent: "#67e8f9", lime: "#b8f36b"
    },
    boxShadow: { glow: "0 0 32px rgba(103,232,249,.08)" }
  }},
  plugins: []
};
export default config;
