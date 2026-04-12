import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'pdf-parse'],
  outputFileTracingIncludes: {
    // pdfjs-dist dynamically loads pdf.worker.mjs at runtime — nft misses it.
    // Force-include the entire legacy build so standalone has the worker file.
    '/api/**': ['./node_modules/pdfjs-dist/legacy/build/**'],
  },
}

export default nextConfig
