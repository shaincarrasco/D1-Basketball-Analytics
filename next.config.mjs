/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repoName = "D1-Basketball-Analytics";
const nextConfig = {
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  ...(isGitHubPages ? { basePath: `/${repoName}` } : {})
};
export default nextConfig;
