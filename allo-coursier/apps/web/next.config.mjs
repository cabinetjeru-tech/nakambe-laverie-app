/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:3002';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // En développement, l'API est servie sur le même domaine que l'application (pas de CORS).
  // En production, le proxy HTTPS (Caddy) route /api vers l'API directement.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
