import type { Config } from "tailwindcss";
import preset from "../../packages/ui/tailwind-preset";

export default {
  presets: [preset as Config],
  content: ["./src/**/*.{ts,tsx}", "../../packages/{ui,kit}/**/*.{ts,tsx}"],
} satisfies Config;
