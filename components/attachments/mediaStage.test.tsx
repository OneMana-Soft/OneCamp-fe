import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { renderAsPerAttachmentType, type StageMedia } from "./mediaStage"
import { holdOverlayFoot } from "./overlayFoot"

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

// From sm up a toast stood on the lightbox's zoom controls at a tablet's width
// and took their taps: the stage at the screen's foot holds the page's overlay
// foot (html[data-overlay-foot], --overlay-foot) and app/phone.css lifts
// toasts 12px above it.
describe("the overlay foot", () => {
  const root = document.documentElement
  const foot = () => ({ on: root.hasAttribute("data-overlay-foot"), at: root.style.getPropertyValue("--overlay-foot") })

  it("is held by the lightbox's zoom controls while drawn, and let go when they go", () => {
    const { unmount } = render(<>{renderAsPerAttachmentType("image", "Whiteboard.png", media({ mime: "image/png", foot: true }))}</>)
    expect(screen.getByRole("toolbar", { name: "Image zoom controls" })).toBeTruthy()
    expect(foot()).toEqual({ on: true, at: "calc(60px + env(safe-area-inset-bottom))" })
    unmount()
    expect(foot()).toEqual({ on: false, at: "" })
  })

  it("is never held by a stage that isn't at the screen's foot (Docs & Files' preview)", () => {
    render(<>{renderAsPerAttachmentType("image", "Whiteboard.png", media({ mime: "image/png" }))}</>)
    expect(screen.getByRole("toolbar", { name: "Image zoom controls" })).toBeTruthy()
    expect(foot().on).toBe(false)
  })

  it("is counted: it stays while any holder holds it, at the highest, and a release twice is one", () => {
    const a = holdOverlayFoot("60px")
    const b = holdOverlayFoot("80px")
    expect(foot()).toEqual({ on: true, at: "max(60px, 80px)" })
    b()
    b()
    expect(foot()).toEqual({ on: true, at: "60px" })
    a()
    expect(foot()).toEqual({ on: false, at: "" })
  })

  // V-1139: the video player's seek bar and buttons run along the stage's foot,
  // and a toast from sm up stood on their right end (Mute, Playback settings,
  // Enter fullscreen) and took their presses.
  it("is held by the lightbox's video player while drawn, through its controls' fade, and let go when it goes", () => {
    const { unmount } = render(<>{renderAsPerAttachmentType("video", "Clip.webm", media({ mime: "video/webm", foot: true }))}</>)
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy()
    const held = foot()
    expect(held).toEqual({ on: true, at: "80px" })
    // Playing, the controls fade when the pointer leaves: the toast doesn't move with them.
    const video = document.querySelector("video")!
    fireEvent.play(video)
    fireEvent.mouseLeave(video.parentElement!)
    expect(foot()).toEqual(held)
    unmount()
    expect(foot()).toEqual({ on: false, at: "" })
  })

  it("is never held by a video on a stage that isn't at the screen's foot (Docs & Files' preview)", () => {
    render(<>{renderAsPerAttachmentType("video", "Clip.webm", media({ mime: "video/webm" }))}</>)
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy()
    expect(foot().on).toBe(false)
  })
})
