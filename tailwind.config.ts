import type { Config } from "tailwindcss";
import preset from "./packages/ui/tailwind-preset";

const config: Config = {
  presets: [preset as Config],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./packages/{ui,kit}/**/*.{ts,tsx}"],
};
export default config;
