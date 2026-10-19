import type { Metadata, Viewport } from "next";
import "./light-v2.css";

/** Design-prototype route, not the live site — kept out of search results. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function LightV2Layout({ children }: { children: React.ReactNode }) {
  return <div className="light-v2-proto">{children}</div>;
}
