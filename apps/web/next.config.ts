import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, '../..');
const phaserBuild = path.join(repoRoot, 'node_modules/phaser/dist/phaser.js');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@motionplay/shared', '@motionplay/controller-engine'],
  outputFileTracingRoot: repoRoot,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      phaser: phaserBuild,
    };
    return config;
  },
};

export default nextConfig;
