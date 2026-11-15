/** @type {import('next').NextConfig} */
// SITE_BASE_PATH is set by CI when the site is served under a sub-path (GitHub Pages).
const basePath = process.env.SITE_BASE_PATH ?? "";
export default {
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  transpilePackages: ["@sports/ui", "@sports/kit", "@sports/packs"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(basePath ? { basePath } : {}),
};
