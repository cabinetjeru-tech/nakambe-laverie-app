/** Export statique : le même build sert le web (hébergement statique) et l'application Android (Capacitor). */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: ['@dread-royal/shared'],
};
export default nextConfig;
