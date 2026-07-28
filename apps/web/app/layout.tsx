import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Message Center - Dev",
  description: "Phase 1 vertical-slice dev inbox",
  appleWebApp: {
    // Standalone iOS home-screen behavior (docs/ROADMAP.md Phase 14) - "default" keeps the real iOS status bar rather than drawing over it, matching UI_GUIDE.md's own no-magic, predictable-chrome philosophy.
    capable: true,
    statusBarStyle: "default",
    title: "Smart Message Center",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0F17",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
