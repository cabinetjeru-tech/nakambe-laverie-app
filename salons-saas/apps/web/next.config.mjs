/**
 * L'application et l'API partagent la même origine : /api/v1/* est relayé vers l'API.
 * Le cookie de session (HttpOnly, SameSite=Strict, Path=/api/v1/auth) reste ainsi
 * « first-party » et aucun CORS n'est nécessaire côté navigateur.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:3002';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
