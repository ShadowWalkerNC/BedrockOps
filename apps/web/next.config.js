/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mc-admin/auth', '@mc-admin/ui'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
