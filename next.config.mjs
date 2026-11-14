/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const basePath = isGitHubPages ? "/D1-Basketball-Analytics" : "";
const nextConfig = {
  output: "export",
  // Shared blocks are TypeScript source in packages/ (npm workspaces).
  transpilePackages: ["@sports/ui", "@sports/kit", "@sports/packs"],
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(basePath ? { basePath } : {}),
};
export default nextConfig;
