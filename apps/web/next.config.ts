import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@saitify/engine', '@saitify/configurator'],
};

export default nextConfig;
