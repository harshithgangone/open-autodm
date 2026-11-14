import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

function loadWranglerVars(): Record<string, string> {
  try {
    const wranglerPath = path.resolve(process.cwd(), 'wrangler.jsonc');
    if (fs.existsSync(wranglerPath)) {
      const raw = fs.readFileSync(wranglerPath, 'utf8');
      const lines = raw.split('\n').filter((l) => !l.trim().startsWith('//'));
      const parsed = JSON.parse(lines.join('\n'));
      return parsed.vars || {};
    }
  } catch {
    // ignore
  }
  return {};
}

const wranglerVars = loadWranglerVars();

// Ensure build-time inlining by Next.js compiler for all NEXT_PUBLIC_* variables
for (const [key, value] of Object.entries(wranglerVars)) {
  if (key.startsWith('NEXT_PUBLIC_') && !process.env[key]) {
    process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || wranglerVars['NEXT_PUBLIC_SUPABASE_URL'] || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || wranglerVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '',
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || wranglerVars['NEXT_PUBLIC_APP_URL'] || '',
  },
  // Instagram CDN thumbnails and Supabase Storage images are rendered with
  // plain <img> tags throughout the app, so the image optimizer is unused.
  // Keeping it disabled makes the build identical on Vercel and Cloudflare.
  images: { unoptimized: true },
};

export default nextConfig;
