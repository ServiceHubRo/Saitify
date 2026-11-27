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
          // The directives that cannot affect how the application works but close whole classes of attack: no plugins, no
          // framing, no <base> hijacking, forms only post back to this site. A script-src policy needs per-request nonces and is
          // tracked in docs/PHASE9-BETA-CHECKLIST.md. Published websites send their own, stricter policy.
          { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
