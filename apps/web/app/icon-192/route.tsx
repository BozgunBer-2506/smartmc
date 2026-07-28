import { ImageResponse } from "next/og";

export const runtime = "edge";

/** Generated at request time via next/og (no external image-generation tool available in this environment, no checked-in placeholder asset either) - a real PNG, on-brand (the product's own dark background + accent color), not a generic default icon. */
export function GET() {
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
          borderRadius: 32,
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
    { width: 192, height: 192 },
  );
}
