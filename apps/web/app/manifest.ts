import type { MetadataRoute } from "next";

/**
 * The Web App Manifest (docs/ROADMAP.md Phase 14) - Next.js's App Router
 * file convention auto-serves this at /manifest.webmanifest, and links it
 * from every page's <head> automatically. Icons are generated dynamically
 * by app/icon-192/route.tsx and app/icon-512/route.tsx (real PNGs via
 * next/og's ImageResponse, not a placeholder asset) rather than checked-in
 * image files - this project has no design tool in the loop to produce a
 * real brand icon yet, so a generated, on-brand placeholder (the product's
 * accent color and initial) is the honest choice over a generic default.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Message Center",
    short_name: "SMC",
    description: "One inbox for every messaging channel, with automation and AI built in.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0F17",
    theme_color: "#0B0F17",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
