import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'pdf-parse'],
}

export default nextConfig
