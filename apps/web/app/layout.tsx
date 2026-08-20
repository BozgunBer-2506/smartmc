import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_NO_FLASH_SCRIPT } from "@smc/ui";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Message Center",
  description: "Unified inbox, automation, and AI for every messaging channel you use.",
  appleWebApp: {
    // Standalone iOS home-screen behavior (docs/ROADMAP.md Phase 14) - "default" keeps the real iOS status bar rather than drawing over it, matching UI_GUIDE.md's own no-magic, predictable-chrome philosophy.
    capable: true,
    statusBarStyle: "default",
    title: "Smart Message Center",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F17" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: `data-theme` is set by the inline no-flash
    // script below before React hydrates, so the server-rendered markup
    // (which has no `data-theme`) and the client's first paint legitimately
    // differ - the standard, documented React escape hatch for exactly
    // this case, not a way to hide a real bug.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
