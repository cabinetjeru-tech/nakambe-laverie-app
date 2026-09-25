/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Politique de sécurité du contenu. Jitsi (visioconférence) est autorisé en iframe/script.
const jitsiDomain = process.env.JITSI_DOMAIN || "meet.jit.si";
// Envoi direct des fichiers du navigateur vers le stockage S3 (Supabase Storage, R2…).
let storageOrigin = "";
try {
  if (process.env.S3_ENDPOINT) storageOrigin = new URL(process.env.S3_ENDPOINT).origin;
} catch {}
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isProd ? "" : "'unsafe-eval'"} https://${jitsiDomain}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${storageOrigin}`.trim(),
  `media-src 'self' blob: https: ${storageOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' https://${jitsiDomain} wss://${jitsiDomain} ${storageOrigin}`.trim(),
  `frame-src 'self' https://${jitsiDomain} https://www.youtube-nocookie.com https://player.vimeo.com`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["unpdf", "mammoth", "pdf-lib", "@prisma/client", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
