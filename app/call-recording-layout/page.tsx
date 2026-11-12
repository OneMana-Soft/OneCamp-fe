import type { Metadata } from "next"
import { RecordingStage } from "@/components/livekit/RecordingStage"

// The page LiveKit's egress records a call from (H3, meet-17): the call's stage,
// drawn for the recorder alone. It needs no OneCamp session and reads no OneCamp
// API: it reaches the room only with the short recorder token (hidden,
// subscribe-only) the backend's redirect puts in the address's fragment, which
// never leaves the page but to LiveKit. Never a search result, never a referrer,
// and in no sitemap.
export const metadata: Metadata = {
  title: "Recording",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function CallRecordingLayoutPage() {
  return <RecordingStage />
}
