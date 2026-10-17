import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/doc/docPreview", () => ({ DocPreview: () => <div /> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/app/doc" }))
vi.mock("react-redux", async (importOriginal) => ({ ...(await importOriginal<object>()), useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { DocCard } from "./docCard"
import { hueFor } from "@/lib/campHue"
import type { DocListItem } from "@/types/docGraph"

afterEach(cleanup)

const doc: DocListItem = {
  doc_uuid: "98790bd2-f8f8-4a06-acaa-dc20333831cf",
  doc_title: "Q4 launch plan",
  doc_updated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  doc_private: true,
  // The shown name is user_name by the one rule (lib/personName.ts).
  owner: { user_uuid: "u1", user_name: "Sam", user_full_name: "Sam Rivera" },
  path: [{ doc_uuid: "p1", doc_title: "Engineering" }, { redacted: true }],
}

describe("a doc in the list (D02)", () => {
  it("is a link to the doc named by its title, where it sits and when it changed", () => {
    render(<DocCard doc={doc} href="/app/doc/98790bd2-f8f8-4a06-acaa-dc20333831cf" />)
    const link = screen.getByRole("link", { name: /Q4 launch plan, in Engineering › …, edited 2h ago/ })
    expect(link.getAttribute("href")).toBe("/app/doc/98790bd2-f8f8-4a06-acaa-dc20333831cf")
  })

  // INTERACTION_SPEC D13: a doc wears its hue (its glyph's colour, else its
  // id's). The docs home was identical grey cards (PG2-09).
  it("rests on e1 with no border, and wears the doc's own hue", () => {
    const { container } = render(<DocCard doc={doc} href="/x" />)
    const card = screen.getByRole("link")
    expect(card.className).toMatch(/\bsm:shadow-e1\b/)
    expect(card.className).not.toMatch(/(^|\s)border(\s|-)/)
    expect(card.getAttribute("data-hue")).toBe(hueFor(doc.doc_uuid))
    // On a phone its icon sits on a tile in that hue, the page glyph in it.
    expect(container.querySelector("[class*='max-sm:bg-hue-tint']")).toBeTruthy()
    expect(container.querySelector('[data-doc-icon="page"]')?.getAttribute("data-hue")).toBe(hueFor(doc.doc_uuid))
    // The owner still has their face.
    expect(container.querySelector("[class*='avatar-person']")).toBeTruthy()
  })

  it("wears the colour its owner gave its glyph over its id's, and none when they chose grey", () => {
    cleanup()
    render(<DocCard doc={{ ...doc, doc_icon: "glyph:rocket:moss" }} href="/x" />)
    expect(screen.getByRole("link").getAttribute("data-hue")).toBe("moss")
    cleanup()
    render(<DocCard doc={{ ...doc, doc_icon: "glyph:rocket:gray" }} href="/x" />)
    expect(screen.getByRole("link").hasAttribute("data-hue")).toBe(false)
  })

  it("names who owns it and shows who can open it", () => {
    render(<DocCard doc={doc} href="/x" />)
    expect(screen.getByText(/Sam ·/)).toBeTruthy()
    expect(screen.getByRole("link").getAttribute("aria-label")).toMatch(/private/)
  })

  it("shows a doc nobody named yet by its placeholder, never a stored title (D-6)", () => {
    render(<DocCard doc={{ ...doc, doc_title: "" }} href="/x" />)
    const title = screen.getByRole("heading", { name: "Untitled" })
    expect(title.className).toMatch(/text-ink-3/)
  })

  it("has a menu of its own beside the link, named for the doc", () => {
    render(<DocCard doc={doc} href="/x" />)
    expect(screen.getByRole("button", { name: "More for Q4 launch plan" })).toBeTruthy()
  })
})
