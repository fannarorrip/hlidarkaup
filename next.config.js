/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // TS type-debt cleared (2026-07-13): @types/pg installed + all query/PDF/settings typings fixed,
  // so `next build` now type-checks for real. (Next 16 dropped `next lint`, so no eslint key here.)
};

module.exports = nextConfig;
