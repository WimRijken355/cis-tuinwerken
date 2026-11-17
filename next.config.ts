import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

/**
 * Next.js-configuratie.
 *
 * - `output: "standalone"`: de prod-build bevat een zelfstandige server
 *   (node .next/standalone/server.js) zodat de Docker-image klein blijft.
 * - Serwist maakt er een PWA van (installeerbaar op het homescherm).
 *   In development staat de service worker uit — anders vecht hij met HMR.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withSerwist(nextConfig);
