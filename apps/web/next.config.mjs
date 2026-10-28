/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const rawApiBase = (
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      (isProd ? 'https://exprest.onrender.com' : 'http://localhost:4000')
    ).replace(/\/+$/, '');

    let apiBase = isProd ? 'https://exprest.onrender.com' : 'http://localhost:4000';
    try {
      const parsed = new URL(rawApiBase);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        apiBase = parsed.origin;
      }
    } catch {}

    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
