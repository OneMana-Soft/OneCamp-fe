import { ImageResponse } from "next/og";

/**
 * The card people see when a OneCamp link is shared.
 *
 * There was none. Every share of the workspace, and of the public demo, rendered
 * as a bare link with no image, no title and no description, on the channel that
 * sends this product more visitors than any other.
 *
 * Deliberately edition-neutral: it names the modules both editions ship and says
 * nothing about AI, so the same card is correct on the AI build, the AI-free
 * build and the demo, and cannot become a claim one of them fails to keep.
 */
export const runtime = "edge";
export const alt = "OneCamp: chat, docs, tasks and calls in one workspace you own";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "#C24A0A";
const INK = "#17150F";
const MUTED = "#5F5A4E";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#FBFAF7",
          // A single warm edge rather than a gradient wash: it reads as a product
          // surface at thumbnail size, where a gradient reads as mud.
          borderLeft: `24px solid ${BRAND}`,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: BRAND,
            fontWeight: 600,
          }}
        >
          Self-hosted workspace
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 78,
            lineHeight: 1.05,
            fontWeight: 700,
            color: INK,
            letterSpacing: -2,
          }}
        >
          The workspace you own.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            lineHeight: 1.35,
            color: MUTED,
            maxWidth: 900,
          }}
        >
          {"Chat, documents, tasks, boards, calendar and video calls. One install, on your server, with no per-seat pricing."}
        </div>
        <div style={{ display: "flex", marginTop: 44, gap: 14 }}>
          {["Pay once", "Unlimited users", "Your data"].map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                padding: "12px 22px",
                borderRadius: 8,
                border: "1px solid #E4E0D5",
                fontSize: 24,
                fontWeight: 600,
                color: MUTED,
                background: "#FFFFFF",
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
