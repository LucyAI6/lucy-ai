/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['replicate.delivery', 'pbxt.replicate.delivery', 'v3.fal.media'],
  },
}

module.exports = nextConfig
