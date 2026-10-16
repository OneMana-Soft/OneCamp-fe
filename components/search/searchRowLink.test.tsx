import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { isPlainLeftClick } from "@/lib/ui/linkClick"
import type { SearchResult } from "@/services/searchService"

vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))

const { SearchResultRow } = await import("@/components/search/searchResultRow")

// QA DSA-13 (14 Oct 2026): search rows were buttons, so a middle click or
// Ctrl-click did nothing and a hit's address couldn't be copied or opened in
// a new tab. A row with an address is a link; a plain click still opens it
// in the app.

// jsdom can't open a new tab: a click the app leaves to the browser stops here.
const browser = (e: MouseEvent) => e.preventDefault()
beforeEach(() => document.addEventListener("click", browser))
afterEach(() => {
  document.removeEventListener("click", browser)
  cleanup()
})

const doc = { type: "doc", doc: { doc_uuid: "d1", doc_title: "Q4 launch plan", created_date: 1791614952 } } as unknown as SearchResult

describe("a search hit with an address", () => {
  it("is a link to it", () => {
    render(<ul><SearchResultRow result={doc} onOpen={() => {}} href="/app/doc/d1" /></ul>)
    expect(screen.getByRole("link", { name: /Q4 launch plan/ }).getAttribute("href")).toBe("/app/doc/d1")
  })

  it("opens in the app on a plain click, and leaves a Ctrl, ⌘ or middle click to the browser", () => {
    const onOpen = vi.fn()
    render(<ul><SearchResultRow result={doc} onOpen={onOpen} href="/app/doc/d1" /></ul>)
    const link = screen.getByRole("link", { name: /Q4 launch plan/ })
    fireEvent.click(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
    fireEvent.click(link, { ctrlKey: true })
    fireEvent.click(link, { metaKey: true })
    fireEvent.click(link, { button: 1 })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("stays a button where there is no address", () => {
    render(<ul><SearchResultRow result={doc} onOpen={() => {}} /></ul>)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByRole("button", { name: /Q4 launch plan/ })).toBeTruthy()
  })
})

describe("isPlainLeftClick", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
  it("is the main button with no modifier only", () => {
    expect(isPlainLeftClick(click)).toBe(true)
    expect(isPlainLeftClick({ ...click, button: 1 })).toBe(false)
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(isPlainLeftClick({ ...click, [k]: true })).toBe(false)
  })
})
