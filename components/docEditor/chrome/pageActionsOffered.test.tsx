import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: hoisted.push }) }))
vi.mock("./useDoc", () => ({ useDoc: () => ({ doc_edit_access: 1 }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined }),
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/use-toast", () => ({ toast: () => {} }))

// The page guard's chunk, loaded: what a doc page has once the chunk is in,
// before React draws the guard. Under load that was seconds: React 19 holds a
// lazy piece's first draw back up to 300 ms after the page last drew a
// fallback, and a doc page loading its pieces draws one after another.
import PageGuard from "./PageGuard"
import { navigate } from "./pageFacts"
import { actionsFor } from "@/components/docEditor/registry/registry"

afterEach(cleanup)

const offered = (id: string) => actionsFor("more", { ai: false }).some((a) => a.id === id)

describe("B6's page actions (N32 under load)", () => {
  // Delete was in More from the moment the chunk loaded. Run before the guard
  // was drawn, it found no router to leave the page with, and left it by a
  // full page load (pageFacts' navigate), which took the Undo toast with it.
  it("are offered only once the guard has handed the router over, so Delete leaves the page in the app", () => {
    expect(offered("doc.trash")).toBe(false)
    expect(offered("doc.duplicate")).toBe(false)
    render(<PageGuard docId="n32" editor={null} />)
    expect(offered("doc.trash")).toBe(true)
    navigate("/app/doc")
    expect(hoisted.push).toHaveBeenCalledWith("/app/doc")
  })
})
