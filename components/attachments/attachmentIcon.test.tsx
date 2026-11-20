import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// A file's thumbnail opens it. It was a div with a click handler: no focus,
// no name. It is a button now, out of the tab order only where something
// beside it opens the same file.

vi.mock("@/hooks/useFetch", () => ({ useMediaFetch: (url: string) => ({ data: url ? { url: `https://files.example${url}` } : undefined }) }))
vi.mock("next/image", () => ({ default: (p: { alt: string; src: string }) => <img alt={p.alt} src={p.src} /> }))
const getVideoThumbnail = vi.fn<(url: string) => Promise<string>>()
vi.mock("@/lib/utils/file/getVideoThumbnail", () => ({ getVideoThumbnail: (url: string) => getVideoThumbnail(url) }))

const { AttachmentIcon } = await import("./attachmentIcon")

afterEach(cleanup)

describe("AttachmentIcon", () => {
  it("is a button named after its file, that opens it", () => {
    const open = vi.fn()
    render(<AttachmentIcon fileName="brief.pdf" getUrl="/ch/getFile/c1/a1" attachmentType="document" attachmentOnCLick={open} />)
    const button = screen.getByRole("button", { name: "Open brief.pdf" })
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
    expect(button.getAttribute("tabindex")).toBeNull()
  })

  it("is disabled while there is nothing to open yet", () => {
    render(<AttachmentIcon fileName="brief.pdf" attachmentType="document" attachmentOnCLick={() => {}} />)
    expect((screen.getByRole("button", { name: "Open brief.pdf" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("leaves the tab order when told something beside it opens the file", () => {
    render(<AttachmentIcon fileName="brief.pdf" getUrl="/x" attachmentType="document" attachmentOnCLick={() => {}} focusable={false} />)
    expect(screen.getByRole("button", { name: "Open brief.pdf" }).getAttribute("tabindex")).toBe("-1")
  })

  it("shows an image as itself, and a video with no first frame yet as its glyph", () => {
    getVideoThumbnail.mockReturnValueOnce(new Promise(() => {}))
    render(<AttachmentIcon fileName="board.png" getUrl="/i1" attachmentType="image" attachmentOnCLick={() => {}} />)
    render(<AttachmentIcon fileName="clip.mp4" getUrl="/v1" attachmentType="video" attachmentOnCLick={() => {}} />)
    expect(screen.getByRole("img", { name: "board.png" }).getAttribute("src")).toBe("https://files.example/i1")
    expect(screen.getByRole("button", { name: "Open clip.mp4" }).querySelector("img")).toBeNull()
  })

  // V-1160: a video whose file won't load rejected its thumbnail with nobody
  // listening, an unhandled "Failed to load video" on every such card.
  it("keeps a video's glyph, quietly, when its thumbnail can't be drawn", async () => {
    getVideoThumbnail.mockRejectedValueOnce(new Error("Failed to load video"))
    const unhandled: unknown[] = []
    const note = (e: unknown) => unhandled.push(e)
    process.on("unhandledRejection", note)
    try {
      render(<AttachmentIcon fileName="clip.mp4" getUrl="/ch/getFile/c1/v1" attachmentType="video" attachmentOnCLick={() => {}} />)
      await act(() => new Promise((r) => setTimeout(r, 0)))
    } finally {
      process.off("unhandledRejection", note)
    }
    expect(unhandled).toEqual([])
    expect(getVideoThumbnail).toHaveBeenCalledWith("https://files.example/ch/getFile/c1/v1")
    expect(screen.getByRole("button", { name: "Open clip.mp4" }).querySelector("img")).toBeNull()
  })

  it("draws only the newest file's thumbnail when an older one lands late", async () => {
    const pending = new Map<string, (thumb: string) => void>()
    getVideoThumbnail.mockImplementation((url) => new Promise((resolve) => pending.set(url, resolve)))
    const props = { fileName: "clip.mp4", attachmentType: "video" as const, attachmentOnCLick: () => {} }
    const { rerender } = render(<AttachmentIcon {...props} getUrl="/old" />)
    rerender(<AttachmentIcon {...props} getUrl="/new" />)
    await act(async () => pending.get("https://files.example/new")?.("data:new"))
    await act(async () => pending.get("https://files.example/old")?.("data:old"))
    expect(screen.getByRole("img", { name: "clip.mp4" }).getAttribute("src")).toBe("data:new")
    getVideoThumbnail.mockReset()
  })
})
