import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /api/nia/* and /api/admin/* are handled by Next.js Route Handlers.
  // i18n locale routing (/<locale>/...) is provided by next-intl (src/i18n/*).
};

export default withNextIntl(nextConfig);
