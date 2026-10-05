import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Prisma ships native engine binaries; keep it external to the server bundle.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    // Server Actions are the only mutation boundary; cap the request bodies they accept.
    serverActions: { bodySizeLimit: '8mb' }
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      }
    ];
  }
};

export default nextConfig;
