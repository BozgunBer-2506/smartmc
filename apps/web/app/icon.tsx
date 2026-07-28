import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The browser-tab favicon (Next's app/icon.tsx convention, auto-linked). Same generated mark as icon-192/icon-512, at favicon size. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#5B8DEF",
          borderRadius: 6,
          fontSize: 22,
          fontWeight: 700,
          color: "#0B0F17",
          fontFamily: "sans-serif",
        }}
      >
        S
      </div>
    ),
    size,
  );
}
