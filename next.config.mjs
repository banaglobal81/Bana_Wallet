/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TEMPORARY (Phases 1–2): proxy /api/* to the existing Express backend on :8787
  // so the UI is testable before the API route handlers are ported in Phase 3.
  // Returned as a plain array => "afterFiles", so once app/api/nia/** route handlers
  // exist they take precedence and supersede these rewrites. Removed in Phase 3/5.
  async rewrites() {
    const target = process.env.LEGACY_API_PORT || '8787';
    return [
      { source: '/api/:path*', destination: `http://localhost:${target}/api/:path*` },
    ];
  },
};

export default nextConfig;
