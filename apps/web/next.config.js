/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@mc-admin/db',
    '@mc-admin/audit',
    '@mc-admin/auth',
    '@mc-admin/backups',
    '@mc-admin/bedrock',
    '@mc-admin/config',
    '@mc-admin/moderation',
    '@mc-admin/notifications',
    '@mc-admin/pipelines',
    '@mc-admin/templates',
    '@mc-admin/ui'
  ]
};

module.exports = nextConfig;
