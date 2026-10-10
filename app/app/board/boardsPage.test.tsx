import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

const LAUNCH_RETRO = [{ board_uuid: "b0a10000-0000-4000-8000-000000000001", board_title: "Launch retro", board_private: false, board_updated_at: "" }]
let boards: typeof LAUNCH_RETRO = LAUNCH_RETRO
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: { boards } }, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
// The search answers at once, so a test need not wait out the debounce.
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useRelativeTime", () => ({ useRelativeTime: () => "" }))

import BoardsPage from "./page"

afterEach(() => {
  cleanup()
  boards = LAUNCH_RETRO
})

/** The drawing above an empty state, and the hue it is drawn in. */
function spotHue() {
  const svg = document.querySelector("[data-empty-illustration] svg")
  return svg ? /hue-(\w+)/.exec(svg.getAttribute("class") || "")?.[1] : undefined
}

describe("the boards list", () => {
  it("opens with its title and one action, without a marketing line", () => {
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Boards" })).toBeTruthy()
    expect(screen.queryByText(/Infinite collaborative canvas/)).toBeNull()
    expect(screen.getByRole("button", { name: /New board/ })).toBeTruthy()
  })

  it("lists each board as a link, a board with no picture in its own hue", () => {
    render(<BoardsPage />)
    const link = screen.getByRole("link", { name: /Launch retro/ })
    expect(link.getAttribute("href")).toMatch(/b0a10000-0000-4000-8000-000000000001$/)
    expect(link.innerHTML).toContain(`hue-${hueFor("b0a10000-0000-4000-8000-000000000001")}`)
    expect(link.className).toMatch(/hover-lift/)
  })

  it("with no boards yet, draws a ring of people and ideas over its one sentence and one action", () => {
    boards = []
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { name: "No boards yet" })).toBeTruthy()
    expect(screen.getByText(/A board is a blank canvas for sketches/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create a board" })).toBeTruthy()
    expect(spotHue()).toBe("dusk")
  })

  it("when a search finds nothing, says so under the search drawing", () => {
    render(<BoardsPage />)
    boards = []
    fireEvent.change(screen.getByRole("searchbox", { name: "Search boards" }), { target: { value: "roadmap" } })
    expect(screen.getByRole("heading", { name: "No boards match \u201croadmap\u201d." })).toBeTruthy()
    expect(spotHue()).toBe("lake")
    // Not the first-board invitation: there are boards, just none by that name.
    expect(screen.queryByRole("button", { name: "Create a board" })).toBeNull()
  })
})
