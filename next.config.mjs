/** @type {import('next').NextConfig} */
// CI sets NEXT_PUBLIC_BASE_PATH (/<repo>/d1-hoops on GitHub Pages); local dev serves from /.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
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
