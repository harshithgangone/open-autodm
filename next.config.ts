import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['undici'],
  // Instagram CDN thumbnails and Supabase Storage images are rendered with
  // plain <img> tags throughout the app, so the image optimizer is unused.
  // Keeping it disabled makes the build identical on Vercel and Cloudflare.
  images: { unoptimized: true },
};

export default nextConfig;
