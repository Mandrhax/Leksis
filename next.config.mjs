/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'pdf-parse'],
}

export default nextConfig
