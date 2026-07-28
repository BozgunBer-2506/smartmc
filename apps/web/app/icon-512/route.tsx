import { ImageResponse } from "next/og";

export const runtime = "edge";

/** Same generated icon as icon-192/route.tsx at a larger size - see that file's comment for why this is generated, not a checked-in asset. */
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
          borderRadius: 84,
        }}
      >
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: 74,
            background: "#5B8DEF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 256,
            fontWeight: 700,
            color: "#0B0F17",
            fontFamily: "sans-serif",
          }}
        >
          S
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
