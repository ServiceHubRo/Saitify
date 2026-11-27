import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  transpilePackages: ['@saitify/engine', '@saitify/configurator', '@saitify/platform', '@saitify/editor'],
  // Native/WASM database drivers must not be bundled.
  serverExternalPackages: ['postgres', '@electric-sql/pglite'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Browsers ignore this over plain HTTP, so it only takes effect on the HTTPS production site (and then for a year).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          // The Content-Security-Policy of the application itself is set in proxy.ts: published websites send their own, stricter
          // policy and a global header here would replace it.
        ],
      },
    ];
  },
};

export default nextConfig;
