import type { NextConfig } from 'next'
import path from 'path'
// Static export so the desktop (.exe) build can serve the app from disk.
const config: NextConfig = { reactStrictMode: true, transpilePackages: ['three'], output: 'export', basePath: process.env.NEXT_PUBLIC_BASE_PATH || '', assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || undefined, trailingSlash: true, images: { unoptimized: true }, outputFileTracingRoot: path.resolve(__dirname) }
export default config
