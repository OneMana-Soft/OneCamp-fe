import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The Teams tab. It had no way to make a team, and its empty state ("No teams
// found.") had no action; a failed load claimed there were none. Now "New
// team" opens the app's create dialog, the list is fetched again when that
// dialog closes, a failed load says so, a team of one reads "1 member", and
// the list loads as the rows it will show.

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver

const state = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
  createOpen: false,
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.list }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const dispatch = vi.hoisted(() => vi.fn())
vi.mock("react-redux", () => ({
  useDispatch: () => dispatch,
  useSelector: (pick: (s: unknown) => unknown) => pick({ ui: { createTeam: { isOpen: state.createOpen } } }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { default: TeamsCard } = await import("./teamCard")

const ZERO = "0001-01-01T00:00:00Z"
const team = (id: string, name: string, members: number) => ({ team_uuid: id, team_name: name, team_member_count: members, team_deleted_at: ZERO })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.list = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
  state.createOpen = false
})

describe("the Teams tab", () => {
  it("makes a team with the app's create dialog", () => {
    state.list = { data: { data: [team("t1", "Design", 4)], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<TeamsCard />)
    fireEvent.click(screen.getByRole("button", { name: "New team" }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ key: "createTeam" }) }))
  })

  it("welcomes the first team with a sky illustration, and offers to make it", () => {
    state.list = { data: { data: [], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<TeamsCard />)
    expect(document.querySelector("[data-empty-illustration] svg.hue-sky")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "New team" }).length).toBeGreaterThanOrEqual(2)
  })

  it("fetches the list again when the create dialog closes", () => {
    state.list = { data: { data: [team("t1", "Design", 4)], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    state.createOpen = true
    const { rerender } = render(<TeamsCard />)
    state.createOpen = false
    rerender(<TeamsCard />)
    expect(state.list.mutate).toHaveBeenCalled()
  })

  it("puts a team's members first in its row, and deleting it last, as Members does", () => {
    state.list = { data: { data: [team("t1", "Design", 4)], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<TeamsCard />)
    const members = screen.getByRole("button", { name: "View members of Design" })
    const remove = screen.getByRole("button", { name: "Delete Design" })
    expect(members.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("says a failed load failed, with Try again", () => {
    const mutate = vi.fn()
    state.list = { data: undefined, isLoading: false, isError: new Error("503"), mutate }
    render(<TeamsCard />)
    expect(screen.queryByText(/No teams found/)).toBeNull()
    expect(screen.getByText("Couldn't load the teams")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("counts a team of one as one member, and loads as the rows it will show", () => {
    state.list = { data: { data: [team("t1", "Design", 1), team("t2", "Studio", 6)], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { unmount } = render(<TeamsCard />)
    expect(screen.getByText("1 member")).toBeTruthy()
    expect(screen.getByText("6 members")).toBeTruthy()
    unmount()
    state.list = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    const { container } = render(<TeamsCard />)
    expect(container.querySelector("ul[aria-busy='true']")?.className).toMatch(/divide-y/)
  })
})
