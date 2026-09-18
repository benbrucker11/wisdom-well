import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The brand logo lockups are already sized/compressed appropriately for
    // where they're used (see app/_components/brand-logo.tsx). Skip Next's
    // on-request image optimization — on Netlify that goes through a
    // separate image-transform function, which is one more thing that can
    // fail independently of the app build/deploy itself and serve a broken
    // image with no visible error.
    unoptimized: true,
  },
};

export default nextConfig;
