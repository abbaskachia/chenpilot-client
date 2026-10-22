import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/security/securityHeaders";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Optimize bundle size
  swcMinify: true,
  compress: true,
  // Improve production build performance
  productionBrowserSourceMaps: false,
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Optimize chunk splitting
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333';
    return [
      {
        source: '/horizon/:path*',
        destination: `${backendUrl}/proxy/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(
          process.env.NODE_ENV || "development",
          process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:2333",
          process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001",
        ),
      },
    ];
  },
};

export default nextConfig;
