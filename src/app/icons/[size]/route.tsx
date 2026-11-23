import { ImageResponse } from "next/og";

/** App icons generated at the edge: /icons/180, /icons/192, /icons/512, /icons/maskable-512 */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const maskable = raw.startsWith("maskable-");
  const size = Math.min(1024, Math.max(32, parseInt(raw.replace("maskable-", ""), 10) || 192));
  const pad = maskable ? size * 0.2 : size * 0.16;
  const mark = size - pad * 2;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#111210", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: mark,
            height: mark,
            background: "#ed755f",
            borderRadius: `${mark * 0.32}px ${mark * 0.32}px ${mark * 0.12}px ${mark * 0.32}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#111210",
            fontSize: mark * 0.62,
            fontWeight: 800,
            fontFamily: "sans-serif",
          }}
        >
          N
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
