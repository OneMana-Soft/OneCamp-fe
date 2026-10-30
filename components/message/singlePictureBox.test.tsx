import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import type { AttachmentMediaReq } from "@/types/attachment"

// E1: one picture without a stored size drew a tile of zero width. Two things
// met: the image card drew nothing when the file had no width or height (its
// 500 x 375 fallback never ran), and the tile's width, min(100%, 480px, …),
// sat in a w-fit row, so the 100% had only that empty content to measure and
// resolved to 0. The row now spans the column, so the tile keeps its box before
// and after the picture loads, and the card draws at the fallback size.

vi.mock("@/hooks/useFetch", () => ({
  useMediaFetch: () => ({ data: { url: "https://files.example/x" } }),
  useFetch: () => ({ data: undefined }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/image", () => ({ default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} /> }))

const { ImageAttachmentCard } = await import("@/components/attachmentCard/imageAttachmentCard")
const { MessageAttachments } = await import("./MessageAttachments")

const unsized: AttachmentMediaReq = {
  attachment_uuid: "i1", attachment_file_name: "launch-banner.png", attachment_type: "image",
  attachment_size: 1, attachment_created_at: "", attachment_raw_type: "image/png",
} as AttachmentMediaReq

afterEach(cleanup)

describe("one picture without a stored size", () => {
  it("is drawn by the image card at its fallback size", () => {
    const { getByRole } = render(<ImageAttachmentCard attachment={unsized} url="https://files.example/x" selfSize cover />)
    expect(getByRole("img", { name: "launch-banner.png" })).toBeTruthy()
  })

  it("sits in a row that spans the column, so the tile's min(100%, …) width has something to measure", () => {
    const { container } = render(<MessageAttachments attachments={[unsized]} mediaGetUrl="/ch/getFile/c1" attachmentSelected={() => {}} />)
    const row = container.querySelector<HTMLElement>("[data-media-grid]")!
    expect(row.className.split(/\s+/)).toContain("w-full")
    expect(row.className.split(/\s+/)).not.toContain("w-fit")
    const tile = container.querySelector<HTMLElement>("[data-media-tile]")!
    expect(tile.style.width).toMatch(/^min\(100%/)
  })
})
