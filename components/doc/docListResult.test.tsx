import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The docs home's list (docs programme B5): each tab's empty state says what
// goes there, an error is never shown as an empty list (I19), loading keeps
// the list's own shape, and the first card's templates are the server's (a
// template's body is written by the server as the doc is made: N37).

const createDoc = vi.fn()
vi.mock("@/services/docGraphService", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createDoc: (req: unknown) => createDoc(req),
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => "/app/doc" }))
vi.mock("react-redux", async (importOriginal) => ({ ...(await importOriginal<object>()), useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { DocListResult, NewDocCard } from "./docListResult"
import { BUILTIN_DOC_TEMPLATES } from "@/lib/docTemplates"

afterEach(() => {
  cleanup()
  createDoc.mockReset()
  push.mockReset()
})

/** The drawing above an empty state, and the hue it is drawn in. */
function spotHue() {
  const svg = document.querySelector("[data-empty-illustration] svg")
  return svg ? /hue-(\w+)/.exec(svg.getAttribute("class") || "")?.[1] : undefined
}

describe("an empty docs list", () => {
  it("on Mine, offers the first doc: the spot, three of OneCamp's templates and one primary", async () => {
    createDoc.mockResolvedValue({ doc_uuid: "d-new", doc_title: "" })
    render(<DocListResult items={[]} view="grid" tab="mine" />)
    expect(screen.getByRole("heading", { name: "Write the first doc" })).toBeTruthy()
    expect(spotHue()).toBe("sky")
    const rows = [...document.querySelectorAll("[data-template-row]")].map((r) => r.getAttribute("data-template-row"))
    expect(rows).toEqual(BUILTIN_DOC_TEMPLATES.slice(0, 3).map((t) => t.id))
    fireEvent.click(screen.getByRole("button", { name: "New doc" }))
    await waitFor(() => expect(createDoc).toHaveBeenCalledOnce())
    // No stored title: "Untitled" is only the placeholder (D-6).
    expect(createDoc.mock.calls[0][0]).toEqual({ doc_title: "", space: "private", doc_private: true })
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/doc/d-new?new=1"))
  })

  it("starts a doc from a template by its id, for the server to write its body", async () => {
    createDoc.mockResolvedValue({ doc_uuid: "d-tpl", doc_title: "Meeting notes" })
    render(<DocListResult items={[]} view="grid" tab="mine" />)
    fireEvent.click(document.querySelector(`[data-template-row="${BUILTIN_DOC_TEMPLATES[0].id}"]`)!)
    await waitFor(() => expect(createDoc).toHaveBeenCalledOnce())
    expect(createDoc.mock.calls[0][0]).toMatchObject({ template_id: BUILTIN_DOC_TEMPLATES[0].id, doc_title: "Meeting notes" })
  })

  it("on Workspace, makes the first doc everyone can open", async () => {
    createDoc.mockResolvedValue({ doc_uuid: "d-ws", doc_title: "" })
    render(<DocListResult items={[]} view="list" tab="workspace" />)
    expect(screen.getByRole("heading", { name: "No workspace docs yet" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "New workspace doc" }))
    await waitFor(() => expect(createDoc).toHaveBeenCalledOnce())
    expect(createDoc.mock.calls[0][0]).toMatchObject({ space: "workspace", doc_private: false })
  })

  it("says what each other tab is for", () => {
    const { rerender } = render(<DocListResult items={[]} view="grid" tab="shared" />)
    expect(screen.getByRole("heading", { name: "Nothing shared with you yet" })).toBeTruthy()
    rerender(<DocListResult items={[]} view="grid" tab="starred" />)
    expect(screen.getByText(/Star a doc from its ⋯ menu/)).toBeTruthy()
    rerender(<DocListResult items={[]} view="grid" tab="recent" />)
    expect(screen.getByRole("heading", { name: "Nothing opened yet" })).toBeTruthy()
    rerender(<DocListResult items={[]} view="grid" tab="archived" />)
    expect(screen.getByRole("heading", { name: "Nothing archived" })).toBeTruthy()
  })

  it("under a filter, says the filter found nothing, with a way to clear it", () => {
    const clear = vi.fn()
    render(<DocListResult items={[]} view="grid" tab="workspace" filtered onClearFilters={clear} />)
    expect(screen.getByRole("heading", { name: "No docs match these filters" })).toBeTruthy()
    expect(screen.queryByText("No workspace docs yet")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(clear).toHaveBeenCalledOnce()
  })
})

describe("the list's frame", () => {
  it("loads as the card grid it will be, in the 1,040 px column", () => {
    render(<DocListResult items={[]} view="grid" tab="mine" isLoading withCreateCard />)
    const skeleton = screen.getByRole("status", { name: "Loading docs" })
    expect(skeleton.querySelector(".max-w-\\[1040px\\]")).toBeTruthy()
    expect(skeleton.querySelectorAll(".sm\\:h-\\[264px\\]").length).toBeGreaterThan(3)
    expect(screen.queryByRole("heading")).toBeNull()
  })

  it("loads as rows in the list view", () => {
    render(<DocListResult items={[]} view="list" tab="workspace" isLoading />)
    expect(document.querySelector('[data-doc-skeleton="rows"]')).toBeTruthy()
  })

  it("says a failed load failed, with Try again, where it would have said there were no docs", () => {
    const onRetry = vi.fn()
    render(<DocListResult items={[]} view="grid" tab="mine" isError onRetry={onRetry} withCreateCard />)
    expect(screen.getByRole("heading", { name: /Couldn't load these docs/ })).toBeTruthy()
    expect(screen.queryByText("Write the first doc")).toBeNull()
  })
})

describe("the new-doc card", () => {
  it("is no dashed wireframe: a sunken card with a blank doc, three templates and the doc templates' gallery", () => {
    render(<NewDocCard />)
    const card = document.querySelector("[data-new-doc-card]")!
    expect(card.className).not.toMatch(/border-dashed/)
    expect(card.className).toMatch(/bg-sunken/)
    expect(screen.getByRole("button", { name: /Blank doc/ })).toBeTruthy()
    expect(card.querySelectorAll("[data-template-row]")).toHaveLength(3)
    // N38: "All templates" leads to the gallery's doc templates.
    expect(screen.getByRole("link", { name: /All templates/ }).getAttribute("href")).toBe("/app/templates?kind=doc")
  })
})
