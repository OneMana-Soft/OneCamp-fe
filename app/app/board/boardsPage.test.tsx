import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const LAUNCH_RETRO = [{ board_uuid: "b0a10000-0000-4000-8000-000000000001", board_title: "Launch retro", board_private: false, board_updated_at: "" }]
let boards: typeof LAUNCH_RETRO = LAUNCH_RETRO
// Each list read the page asks for, and what it answers: the boards, or a failure the test sets.
const asked: string[] = []
let failure: { response: { status: number } } | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url.startsWith("/board/getBoardList")) asked.push(url)
    return { data: failure ? undefined : { data: { boards } }, isLoading: false, isError: failure, mutate: vi.fn() }
  },
}))
// The search answers at once, so a test need not wait out the debounce.
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
// The sidebar's projects and teams, which name a filter's place.
const sidebar = { userProjects: [{ project_uuid: "b0a4d000-0000-4000-8000-0000000046c1", project_name: "Website relaunch" }], userTeams: [{ team_uuid: "b0a4d000-0000-4000-8000-0000000046d1", team_name: "Design" }] }
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: sidebar } }) }))
// The address: what the page reads its filter from, and where it goes.
let address = ""
const push = vi.fn()
const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), useSearchParams: () => new URLSearchParams(address) }))
vi.mock("@/hooks/useRelativeTime", () => ({ useRelativeTime: () => "" }))

import BoardsPage from "./page"

afterEach(() => {
  cleanup()
  boards = LAUNCH_RETRO
  asked.length = 0
  failure = undefined
  address = ""
  push.mockReset()
  replace.mockReset()
})

const P = "b0a4d000-0000-4000-8000-0000000046c1"
const T = "b0a4d000-0000-4000-8000-0000000046d1"
/** The page's last list read, as its parameters. */
const lastAsked = () => Object.fromEntries(new URL(asked[asked.length - 1], "http://x").searchParams)

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
    expect(screen.getByRole("button", { name: /New board/ }).textContent).toMatch(/B$/)
  })

  it("lists each board as a link on a lifted card, a board with no picture as three notes on the dot grid", () => {
    render(<BoardsPage />)
    const link = screen.getByRole("link", { name: /Launch retro/ })
    expect(link.getAttribute("href")).toMatch(/b0a10000-0000-4000-8000-000000000001$/)
    expect(link.className).toMatch(/hover-lift/)
    expect(link.className).toMatch(/shadow-e1/)
    expect(link.querySelector(".dot-ground [data-note-fallback]")).toBeTruthy()
    expect(screen.getByText("1 board")).toBeTruthy()
  })

  it("with no boards yet, offers the five templates drawn small, all the rest, and a blank board", async () => {
    boards = []
    render(<BoardsPage />)
    // Loaded only for a workspace with no boards (components/board/boardsWelcome).
    expect(await screen.findByRole("heading", { name: "Think it through together" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "See all templates" })).toBeTruthy()
    const templates = screen.getByRole("list", { name: "Templates" })
    expect(templates.querySelectorAll("[data-board-template]")).toHaveLength(5)
    for (const id of ["retro", "brainstorm", "kanban", "journey", "swot"]) {
      expect(templates.querySelector(`[data-template-preview="${id}"] svg rect`)).toBeTruthy()
    }
    expect(screen.getByRole("button", { name: "Blank board" })).toBeTruthy()
    // No search over nothing.
    expect(screen.queryByRole("searchbox")).toBeNull()
  })

  it("when a search finds nothing, says so under the search drawing", () => {
    render(<BoardsPage />)
    boards = []
    fireEvent.change(screen.getByRole("searchbox", { name: "Search boards" }), { target: { value: "roadmap" } })
    expect(screen.getByRole("heading", { name: "No boards match \u201croadmap\u201d." })).toBeTruthy()
    expect(spotHue()).toBe("lake")
    // Not the first-board invitation: there are boards, just none by that name.
    expect(screen.queryByRole("button", { name: "Blank board" })).toBeNull()
  })
})

describe("the boards list, filtered (miro-46 1 and 3)", () => {
  it("asks the server for the address's filter, beside the page and the search", () => {
    render(<BoardsPage />)
    expect(lastAsked()).toEqual({ pageSize: "60", pageIndex: "0" })
    cleanup()
    address = "owner=mine"
    render(<BoardsPage />)
    expect(lastAsked()).toEqual({ pageSize: "60", pageIndex: "0", owner: "mine" })
    cleanup()
    address = `owner=shared&project=${P}`
    render(<BoardsPage />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search boards" }), { target: { value: "retro" } })
    expect(lastAsked()).toEqual({ pageSize: "60", pageIndex: "0", search: "retro", owner: "shared", project: P })
    cleanup()
    address = `team=${T}&project=nope`
    render(<BoardsPage />)
    expect(lastAsked()).toEqual({ pageSize: "60", pageIndex: "0", team: T })
  })

  it("shows the filter as pressed chips and a named place, and a chip writes the address", () => {
    address = `owner=mine&project=${P}`
    render(<BoardsPage />)
    expect(screen.getByRole("button", { name: "Mine" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("button", { name: "Website relaunch" }).getAttribute("aria-haspopup")).toBe("dialog")
    // The place and its Clear are one item of the filters' row, so a phone's row wraps them together, never the × alone.
    const pair = screen.getByRole("button", { name: "Clear Website relaunch" }).parentElement!
    expect(pair).toBe(screen.getByRole("button", { name: "Website relaunch" }).parentElement)
    expect(pair.parentElement).toBe(screen.getByRole("group", { name: "Filter boards" }))
    fireEvent.click(screen.getByRole("button", { name: "Shared" }))
    expect(push).toHaveBeenCalledWith(`/app/board?owner=shared&project=${P}`, { scroll: false })
  })

  it("says each filter's own empty, never the first-board templates", () => {
    boards = []
    address = "owner=mine"
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { name: "No boards of yours yet." })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Think it through together" })).toBeNull()
    // A filtered empty list keeps its filters, so the viewer can step back out of it.
    expect(screen.getByRole("group", { name: "Filter boards" })).toBeTruthy()
    cleanup()
    address = "owner=shared"
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { name: "Nothing shared with you yet." })).toBeTruthy()
    cleanup()
    address = `project=${P}`
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { name: "No boards linked to Website relaunch yet." })).toBeTruthy()
    expect(screen.getByText("To link one, open the project's Attachments tab and choose Link a doc or board.")).toBeTruthy()
    cleanup()
    address = `team=${T}`
    render(<BoardsPage />)
    expect(screen.getByRole("heading", { name: "No boards linked to Design's projects yet." })).toBeTruthy()
  })

  it("lets go of a project the server won't show, and says so, instead of an error", () => {
    failure = { response: { status: 404 } }
    address = `owner=mine&project=${P}`
    render(<BoardsPage />)
    expect(replace).toHaveBeenCalledWith("/app/board?owner=mine", { scroll: false })
    expect(screen.getByText("That project isn't available.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("keeps the list's own error for any other failure", () => {
    failure = { response: { status: 503 } }
    address = `project=${P}`
    render(<BoardsPage />)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })
})
