import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { renderAsPerAttachmentType, type StageMedia } from "./mediaStage"

// The stage draws a file by its kind, and what it can't draw is the file's
// card: its glyph, its name, "Can't preview this file" and Download (design
// review, 21 Oct: a PDF in a browser with no PDF viewer was a blank white
// sheet). The lightbox and Docs & Files' preview share it.

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window.navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled
})

const media = (more: Partial<StageMedia> = {}): StageMedia => ({ key: "att-1", url: "https://files.example/att-1", loading: false, onDownload: vi.fn(), ...more })

function card() {
  const c = screen.getByTestId("no-preview")
  return { c, text: c.textContent ?? "", download: within(c).getByRole("button", { name: "Download" }) }
}

describe("what the stage can't draw", () => {
  it("is the PDF's card, with Download, in a browser that shows no PDF in a page", async () => {
    Object.defineProperty(window.navigator, "pdfViewerEnabled", { value: false, configurable: true })
    vi.stubGlobal("fetch", vi.fn())
    const m = media({ mime: "application/pdf" })
    render(<>{renderAsPerAttachmentType("document", "Launch brief.pdf", m)}</>)
    const { c, text, download } = card()
    expect(text).toContain("Launch brief.pdf")
    expect(text).toContain("Can't preview this file")
    expect(c.querySelector("[data-file-glyph]")?.getAttribute("data-file-glyph")).toBe("pdf")
    expect(document.querySelector("iframe")).toBeNull()
    fireEvent.click(download)
    expect(m.onDownload).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("is the same card for a kind no viewer reads", () => {
    const m = media()
    render(<>{renderAsPerAttachmentType("other", "Q4 kickoff.pptx", m)}</>)
    const { text, download } = card()
    expect(text).toContain("Q4 kickoff.pptx")
    expect(text).toContain("Can't preview this file")
    fireEvent.click(download)
    expect(m.onDownload).toHaveBeenCalledTimes(1)
  })

  it("is the card for an image that didn't load, never a broken picture", () => {
    render(<>{renderAsPerAttachmentType("image", "Homepage mock.png", media({ mime: "image/png" }))}</>)
    const img = screen.getByRole("img", { name: "Homepage mock.png" })
    fireEvent.error(img)
    expect(card().text).toContain("Homepage mock.png")
    expect(screen.queryByRole("img", { name: "Homepage mock.png" })).toBeNull()
  })

  it("waits for an image's own address before calling it broken", () => {
    render(<>{renderAsPerAttachmentType("image", "Homepage mock.png", media({ url: "", loading: true }))}</>)
    fireEvent.error(screen.getByRole("img", { name: "Homepage mock.png" }))
    expect(screen.queryByTestId("no-preview")).toBeNull()
  })

  it("draws its card dark on the stage and light in a phone's sheet", () => {
    const { unmount } = render(<>{renderAsPerAttachmentType("other", "a.zip", media())}</>)
    expect(card().c.className).toMatch(/bg-\[#16171A\]/)
    unmount()
    render(<>{renderAsPerAttachmentType("other", "a.zip", media({ tone: "light" }))}</>)
    expect(card().c.className).toMatch(/bg-raised/)
  })
})
