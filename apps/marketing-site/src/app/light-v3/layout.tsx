import type { Metadata, Viewport } from "next";
import "./light-v3.css";

/** Design-prototype route, not the live site — kept out of search results
 * until (if ever) promoted to production. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fdfbf9",
  colorScheme: "light",
};

export default function LightV3Layout({ children }: { children: React.ReactNode }) {
  return <div className="light-v3-proto">{children}</div>;
}
