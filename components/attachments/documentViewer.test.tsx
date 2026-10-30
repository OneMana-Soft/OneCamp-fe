import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import DocumentViewer from "./documentViewer"
import { viewableDocumentType } from "@/lib/utils/file/getAttachmentType"

// MC-50: a PDF's stored file is served as a download (Content-Disposition:
// attachment), so a frame pointed at its address saved it instead of showing
// it. The viewer reads its bytes and shows them from a local address.

const jsdomURL = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.assign(URL, jsdomURL)
})

describe("the document viewer", () => {
  it("shows a PDF from its own bytes, never from its download address", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70])
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })))
    // jsdom has neither.
    const made = vi.fn<(blob: Blob) => string>(() => "blob:local/brief")
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: made, revokeObjectURL: revoked })

    const { container, unmount } = render(<DocumentViewer type="pdf" url="https://files.example/brief.pdf?X-Amz-Signature=s" />)
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy())
    const frame = container.querySelector("iframe")!
    expect(frame.getAttribute("src")).toMatch(/^blob:local\/brief#/)
    expect(fetch).toHaveBeenCalledWith("https://files.example/brief.pdf?X-Amz-Signature=s")
    expect(made.mock.calls[0][0].type).toBe("application/pdf")

    unmount()
    expect(revoked).toHaveBeenCalledWith("blob:local/brief")
  })

  // Its signed address is renewed every few minutes while it is open; the
  // file is the same, so it isn't read again and the reader keeps its page.
  it("reads a file once, however often its signed address is renewed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 })))
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:local/brief"), revokeObjectURL: vi.fn() })
    const { container, rerender } = render(<DocumentViewer type="pdf" url="https://files.example/brief.pdf?X-Amz-Signature=a" />)
    await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy())
    rerender(<DocumentViewer type="pdf" url="https://files.example/brief.pdf?X-Amz-Signature=b" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    expect(container.querySelector("iframe")!.getAttribute("src")).toMatch(/^blob:local\/brief#/)
  })

  it("says it couldn't show a PDF that didn't load, with a way to download it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })))
    const { container, findByText } = render(<DocumentViewer type="pdf" url="https://files.example/brief.pdf" />)
    expect(await findByText("Download to view")).toBeTruthy()
    expect(container.querySelector("iframe")).toBeNull()
  })

  // Design review, 21 Oct: a file it can't show is the stage's card, never a
  // blank page. A browser with no PDF viewer (a phone's Chrome) drew the
  // frame white and empty.
  it("is the stage's card in a browser that shows no PDF in a page, and reads nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 })))
    Object.defineProperty(window.navigator, "pdfViewerEnabled", { value: false, configurable: true })
    try {
      const { container, findByTestId } = render(<DocumentViewer type="pdf" url="https://files.example/brief.pdf" fallback={<div data-testid="card" />} />)
      expect(await findByTestId("card")).toBeTruthy()
      // Its effects have run: a read would have started by now.
      await act(async () => {})
      expect(fetch).not.toHaveBeenCalled()
      expect(container.querySelector("iframe")).toBeNull()
    } finally {
      delete (window.navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled
    }
  })

  it("is the stage's card for a file it couldn't read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Forbidden</html>", { status: 403 })))
    for (const type of ["pdf", "txt", "docx", "xlsx"]) {
      const { findByTestId, queryByText, unmount } = render(<DocumentViewer type={type} url={`https://files.example/f.${type}`} fallback={<div data-testid="card" />} />)
      expect(await findByTestId("card")).toBeTruthy()
      // A refusal's page is never shown as the file's text.
      expect(queryByText(/Forbidden/)).toBeNull()
      unmount()
    }
  })
})

describe("what the viewer can show", () => {
  it("is a PDF, a Word or Excel file and text; never a legacy .doc or an archive", () => {
    expect(["brief.pdf", "Plan.DOCX", "budget.xlsx", "old.xls", "notes.txt", "readme.md", "rows.csv", "data.json", "feed.xml", "run.log"].map(viewableDocumentType)).toEqual([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "txt",
      "md",
      "csv",
      "json",
      "xml",
      "log",
    ])
    for (const name of ["memo.doc", "deck.pptx", "assets.zip", "photo.png", "", "no-extension"]) expect(viewableDocumentType(name)).toBeNull()
    // A name round-tripped from a signed address keeps its real extension.
    expect(viewableDocumentType("brief.pdf?X-Amz-Expires=300")).toBe("pdf")
  })
})
