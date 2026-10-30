import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"

import type { DocFileVersion } from "@/types/docGraph"

// A file of Docs & Files opens as its preview (docs F1b), on the lightbox's
// own stage and viewers: a PDF, Word or Excel file in the in-app viewer, an
// image to zoom; a kind no viewer reads (a pptx, a legacy .doc) is a card
// with Download. Its versions, newest first: name, size, note, who and when,
// each with Download; Replace with a new version for whoever may edit. On a
// phone it is the shared sheet, its actions pinned in the footer.

const sheet = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: sheet.on, isDesktop: !sheet.on }) }))
vi.mock("@/components/attachments/documentViewer", () => ({ default: ({ type, url }: { type: string; url?: string }) => <div data-document-viewer={type} data-url={url} /> }))

const sam = { user_uuid: "u-1", user_name: "Sam Rivera", user_full_name: "Sam Rivera" }
const v = (n: number, name: string, note?: string): DocFileVersion => ({ n, attachment_id: `att-${n}`, name, size_bytes: n * 1024 * 1024, mime: "application/pdf", note, created_by: sam, created_at: `2026-10-${10 + n}T09:00:00Z` })
let versions: DocFileVersion[] = []
const answer = async (url: string): Promise<{ data: unknown }> => {
  if (url.endsWith("/versions")) return { data: { msg: "ok", data: { versions } } }
  return { data: { msg: "ok", url: `https://files.example/${url.split("/").pop()}` } }
}
const get = vi.fn(answer)
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => get(url) } }))
const downloads = vi.fn()
vi.mock("@/lib/utils/file/downloadFile", () => ({ downloadFile: (url: string, name: string) => downloads(url, name) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))

import FilePreview from "./FilePreview"

const onClose = vi.fn()
const onReplace = vi.fn()
function preview(props: Partial<React.ComponentProps<typeof FilePreview>> = {}) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FilePreview file={{ id: "file-1", title: "brief.pdf", canEdit: true }} onClose={onClose} onReplace={onReplace} {...props} />
    </SWRConfig>,
  )
}

beforeEach(() => {
  sheet.on = false
  versions = [v(3, "brief.pdf", "Signed by the client"), v(2, "brief.pdf", "Legal's edits"), v(1, "brief-draft.pdf")]
  get.mockClear()
  get.mockImplementation(answer)
  downloads.mockClear()
  onClose.mockClear()
  onReplace.mockClear()
})
afterEach(cleanup)

describe("a file's preview", () => {
  it("shows the current version in the in-app viewer, with its name, version, size and who", async () => {
    preview()
    const dialog = await screen.findByRole("dialog")
    await waitFor(() => expect(dialog.querySelector("[data-document-viewer]")?.getAttribute("data-url")).toBe("https://files.example/att-3"))
    expect(dialog.querySelector("[data-document-viewer]")?.getAttribute("data-document-viewer")).toBe("pdf")
    expect(within(dialog).getAllByText("brief.pdf").length).toBeGreaterThan(0)
    expect(dialog.querySelector("[data-preview-meta]")?.textContent).toMatch(/^Version 3 · 3 MB · Sam Rivera · /)
  })

  it("is named as the file is, whatever its newest version's file was called", async () => {
    versions = [v(3, "brief (signed).pdf", "Signed by the client"), ...versions.slice(1)]
    preview()
    const dialog = await screen.findByRole("dialog")
    await waitFor(() => expect(dialog.querySelector("[data-document-viewer]")?.getAttribute("data-url")).toBe("https://files.example/att-3"))
    expect(screen.getByRole("dialog", { name: "brief.pdf" })).toBe(dialog)
    // Each version keeps the name it was uploaded with, in the list.
    fireEvent.click(within(dialog).getByRole("button", { name: "See all versions" }))
    expect(within(await within(dialog).findByRole("list", { name: "Versions" })).getByText("brief (signed).pdf")).toBeTruthy()
  })

  it("puts an image on the zoom stage", async () => {
    versions = [{ ...v(1, "mock.png"), mime: "image/png" }]
    preview({ file: { id: "file-1", title: "mock.png", canEdit: true } })
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByRole("toolbar", { name: "Image zoom controls" })).toBeTruthy()
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toContain("files.example/att-1"))
  })

  it("is a card with Download for a kind no viewer reads", async () => {
    versions = [{ ...v(2, "Q4 kickoff.pptx"), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }]
    preview({ file: { id: "file-1", title: "Q4 kickoff.pptx", canEdit: true } })
    const card = await screen.findByTestId("no-preview")
    expect(card.textContent).toContain("Q4 kickoff.pptx")
    expect(card.textContent).toContain("Can't preview this file")
    fireEvent.click(within(card).getByRole("button", { name: "Download" }))
    await waitFor(() => expect(downloads).toHaveBeenCalledWith("https://files.example/att-2", "Q4 kickoff.pptx"))
  })

  // Design review, 22 Oct (390 shot 05): on a phone the card's Download sat
  // above the footer's, two of one action. The footer's is the one, and
  // takes the sheet's primary style while the card shows.
  it("on a phone, is a card whose Download is the sheet's own, primary while the card shows", async () => {
    sheet.on = true
    versions = [{ ...v(2, "Q4 kickoff.pptx"), mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }, v(1, "brief.pdf")]
    preview({ file: { id: "file-1", title: "Q4 kickoff.pptx", canEdit: true } })
    const card = await screen.findByTestId("no-preview")
    expect(card.textContent).toContain("Can't preview this file")
    expect(within(card).queryByRole("button")).toBeNull()
    const footer = screen.getByRole("dialog").querySelector<HTMLElement>("[data-sheet-footer]")!
    const download = within(footer).getByRole("button", { name: "Download" })
    expect(download.className).toMatch(/bg-brand/)
    fireEvent.click(download)
    await waitFor(() => expect(downloads).toHaveBeenCalledWith("https://files.example/att-2", "Q4 kickoff.pptx"))
    // A version the stage can draw: the card goes, and Download is one of the footer's again.
    fireEvent.click(within(footer).getByRole("button", { name: "Versions" }))
    fireEvent.click(await screen.findByRole("button", { name: "View version 1" }))
    await waitFor(() => expect(document.querySelector("[data-document-viewer]")).not.toBeNull())
    expect(screen.queryByTestId("no-preview")).toBeNull()
    expect(within(footer).getByRole("button", { name: "Download" }).className).not.toMatch(/bg-brand/)
  })

  it("lists every version, newest first, each with what changed, who, when and Download", async () => {
    preview({ versions: true })
    const list = await screen.findByRole("list", { name: "Versions" })
    const rows = await within(list).findAllByRole("listitem")
    expect(rows.map((r) => r.getAttribute("data-version"))).toEqual(["3", "2", "1"])
    expect(rows[0].textContent).toContain("Current")
    expect(rows[0].textContent).toContain("Signed by the client")
    expect(rows[1].textContent).toContain("Legal's edits")
    expect(rows[2].textContent).toContain("brief-draft.pdf")
    expect(rows[2].textContent).toContain("Sam Rivera")
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Download version 2" }))
    await waitFor(() => expect(downloads).toHaveBeenCalledWith("https://files.example/att-2", "brief.pdf"))
    // An earlier version can be looked at, and the current one is a click away.
    fireEvent.click(within(rows[2]).getByRole("button", { name: "View version 1" }))
    await waitFor(() => expect(document.querySelector("[data-document-viewer]")?.getAttribute("data-url")).toBe("https://files.example/att-1"))
    expect(screen.getByText("Version 1 of 3")).toBeTruthy()
  })

  it("offers Replace with a new version to whoever may edit, and not to a reader", async () => {
    preview()
    fireEvent.click(await screen.findByRole("button", { name: "Replace with a new version" }))
    expect(onReplace).toHaveBeenCalled()
    cleanup()
    preview({ file: { id: "file-1", title: "brief.pdf", canEdit: false } })
    await screen.findByRole("dialog")
    expect(screen.queryByRole("button", { name: "Replace with a new version" })).toBeNull()
  })

  it("is the shared sheet on a phone, its actions pinned in the footer", async () => {
    sheet.on = true
    preview()
    const dialog = await screen.findByRole("dialog")
    const footer = dialog.querySelector<HTMLElement>("[data-sheet-footer]")!
    expect(within(footer).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Download", "New version", "Versions"])
    fireEvent.click(within(footer).getByRole("button", { name: "Versions" }))
    expect(await screen.findByRole("list", { name: "Versions" })).toBeTruthy()
    // Pressed, Versions is a toggle in the neutral tone, never the orange of an
    // action (design review, 21 Oct); the version on show is marked in ink.
    const versions = within(footer).getByRole("button", { name: "Versions" })
    expect(versions.getAttribute("aria-pressed")).toBe("true")
    expect(versions.getAttribute("data-tone")).toBe("neutral")
    expect(versions.className).not.toMatch(/bg-brand/)
    const on = screen.getByRole("list", { name: "Versions" }).querySelector("[aria-current] > span[aria-hidden]")!
    expect(on.className).toMatch(/bg-ink/)
    expect(on.className).not.toMatch(/bg-brand/)
  })

  it("draws its stage's controls in the stage's white, a pressed Versions too", async () => {
    preview()
    const dialog = await screen.findByRole("dialog")
    const toggle = within(dialog).getByRole("button", { name: "See all versions" })
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    const bar = dialog.querySelector<HTMLElement>("[data-preview-bar]")!
    for (const name of ["Replace with a new version", "Download", "See all versions", "Close"]) {
      expect(within(bar).getByRole("button", { name }).getAttribute("data-tone")).toBe("light")
    }
  })
})

// A read that fails says so where its answer would be, with Try again: the
// versions said "Loading its versions…" for ever, and the stage stayed a
// spinner, when a read failed (code review of F1b).
describe("when a read fails", () => {
  const facts = { name: "brief.pdf", size_bytes: 3 * 1024 * 1024, mime: "application/pdf", versions: 3, attachment_id: "att-3" }
  const offline = (failing: (url: string) => boolean) =>
    get.mockImplementation(async (url: string) => {
      if (failing(url)) throw new Error("offline")
      return answer(url)
    })

  it("says its versions couldn't load, and Try again reads them again", async () => {
    offline((url) => url.endsWith("/versions"))
    preview({ file: { id: "file-1", title: "brief.pdf", canEdit: true, facts }, versions: true })
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText("Couldn't load its versions")).toBeTruthy()
    expect(within(dialog).queryByText("Loading its versions…")).toBeNull()
    get.mockImplementation(answer)
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }))
    expect(within(await within(dialog).findByRole("list", { name: "Versions" })).getAllByRole("listitem")).toHaveLength(3)
  })

  it("says the file couldn't load on its stage, and Try again draws it", async () => {
    offline((url) => !url.endsWith("/versions"))
    preview()
    const dialog = await screen.findByRole("dialog")
    expect(await within(dialog).findByText("Couldn't load this file")).toBeTruthy()
    get.mockImplementation(answer)
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(dialog.querySelector("[data-document-viewer]")?.getAttribute("data-url")).toBe("https://files.example/att-3"))
  })
})
