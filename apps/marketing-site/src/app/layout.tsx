import type { Metadata, Viewport } from "next";
import { brand } from "@/content/site";

/**
 * Fonts are self-hosted via @fontsource instead of the Google Fonts CDN.
 * Faster (no third-party connection), and required for GDPR compliance when
 * serving EU visitors (LG München, Jan 2022, on Google Fonts CDN embedding).
 */
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${brand.domain}`),
  title: {
    default: `${brand.name} / ${brand.tagline}`,
    template: `%s / ${brand.name}`,
  },
  description:
    "Unify conversations from separate messaging platforms into one workspace. Identity resolution, a single inbox and realtime delivery on an event-driven core.",
  openGraph: {
    title: `${brand.name}`,
    description: brand.vision,
    type: "website",
    url: `https://${brand.domain}`,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <a
          href="#top"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
