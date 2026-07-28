import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon (Next's app/apple-icon.tsx convention, auto-linked as apple-touch-icon) - iOS doesn't read the web manifest's icons array for "Add to Home Screen," it needs this dedicated link tag. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0F17",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            background: "#5B8DEF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 96,
            fontWeight: 700,
            color: "#0B0F17",
            fontFamily: "sans-serif",
          }}
        >
          S
        </div>
      </div>
    ),
    size,
  );
}
