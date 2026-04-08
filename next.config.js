/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.unsplash.com', 'picsum.photos'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 8004-solana uses node:fs and fs/promises — exclude from client bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        'fs/promises': false,
        'node:fs': false,
        'node:fs/promises': false,
        'node:path': false,
        'node:os': false,
        path: false,
        os: false,
      };
    }
    // Stub pino-pretty for both client and server to suppress the warning
    config.resolve.alias = {
      ...config.resolve.alias,
      'pino-pretty': false,
    };
    return config;
  },
};

module.exports = nextConfig;
