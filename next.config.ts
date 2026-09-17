import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next.js caps Server Action uploads at 1MB by default. Submittal
      // packages (scanned PDFs, product data sheets) are routinely bigger
      // than that, so this raises the ceiling. 25mb comfortably covers a
      // typical submittal PDF/DOCX; raise further later if needed.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
