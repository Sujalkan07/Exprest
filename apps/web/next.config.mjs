/** @type {import('next').NextConfig} */
const apiBaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
})();

const connectSources = [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://api.maptiler.com',
  'https://*.onrender.com',
  'https://exprest.onrender.com',
  'https://*.vercel.app',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:3000',
];
if (apiBaseOrigin && !connectSources.includes(apiBaseOrigin)) {
  connectSources.push(apiBaseOrigin);
}

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob: https:;
  connect-src ${connectSources.join(' ')};
  worker-src 'self' blob:;
  child-src 'self' blob:;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
`
  .replace(/\s{2,}/g, ' ')
  .trim();

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
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
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
