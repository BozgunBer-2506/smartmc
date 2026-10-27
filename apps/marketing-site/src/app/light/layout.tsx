import type { Metadata, Viewport } from "next";
import "./light.css";

/** Design-prototype route, not the live site — kept out of search results. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Route-scoped viewport override so this prototype renders with a light
 * browser chrome (scrollbar, form controls) without touching the root
 * layout's dark-theme viewport config used by the rest of the site.
 */
export const viewport: Viewport = {
  themeColor: "#fbf9f6",
  colorScheme: "light",
};

export default function LightPrototypeLayout({ children }: { children: React.ReactNode }) {
  return <div className="light-proto">{children}</div>;
}
