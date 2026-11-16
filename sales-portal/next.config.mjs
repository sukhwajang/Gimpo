/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
    serverComponentsExternalPackages: ["@prisma/client", ".prisma/client"],
  },
};
export default nextConfig;
