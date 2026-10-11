import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The lightbox is the media's own stage (content.md F05): full screen on
// near-black, the name and actions in a top bar, the info rail on demand.

vi.mock("@/hooks/useFetch", () => ({ useMediaFetch: () => ({ data: { url: "https://files.example/brief.pdf" } }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/services/aiService", () => ({
  useAnalyzeImage: () => ({ analyzeImage: vi.fn(), isSubmitting: false }),
  useAnalyzeDocument: () => ({ analyzeDocument: vi.fn(), isSubmitting: false }),
}))
vi.mock("@/components/attachments/documentViewer", () => ({ default: () => <div /> }))
vi.mock("@/components/attachments/videoPlayer", () => ({ default: () => <div /> }))
vi.mock("@/components/fileUpload/AudioPlayer", () => ({ AudioPlayer: () => <div /> }))

import { MediaLightboxDialog } from "./attachmentLightboxDialog"

afterEach(cleanup)

const a = { attachment_uuid: "a", attachment_file_name: "brief.pdf", attachment_type: "document", attachment_size: 2_516_582, attachment_created_at: "2026-10-09T10:00:00Z" } as never
const b = { attachment_uuid: "b", attachment_file_name: "notes.txt", attachment_type: "document", attachment_size: 100, attachment_created_at: "2026-10-09T10:00:00Z" } as never

describe("the lightbox", () => {
  it("fills the screen on the dark stage with the name and actions in its top bar", () => {
    render(<MediaLightboxDialog media={a} allMedia={[a, b]} mediaGetUrl="/m" dialogOpenState setOpenState={() => {}} />)
    const box = document.querySelector("[data-lightbox]")!
    expect(box.className).toMatch(/bg-\[rgb\(8_9_10\/\.92\)\]/)
    for (const name of ["Download", "Copy link", "Info", "Close", "Previous", "Next"]) expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0)
  })

  it("opens the info rail on demand, listing the set", () => {
    render(<MediaLightboxDialog media={a} allMedia={[a, b]} mediaGetUrl="/m" dialogOpenState setOpenState={() => {}} />)
    expect(document.querySelector("[data-lightbox-rail]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Info" }))
    expect(document.querySelector("[data-lightbox-rail]")?.textContent).toMatch(/In this set · 2/)
  })
})
