/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 3 complete: /api/nia/* route handlers are now live.
  // The temporary rewrites() block that proxied to the legacy Express backend
  // has been removed — Next.js App Router handles all /api/nia/* traffic directly.
};

export default nextConfig;
