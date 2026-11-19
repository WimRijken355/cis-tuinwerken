import type { MetadataRoute } from "next";

/** Web-app-manifest: maakt de app installeerbaar op het homescherm (PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tuinwerken Cis",
    short_name: "Tuinwerken",
    description: "Planning, urenregistratie en facturatie voor Tuinwerken Cis",
    lang: "nl",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f6",
    theme_color: "#2f662f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Extra padding so the logo survives the circle/squircle crop on Android.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
