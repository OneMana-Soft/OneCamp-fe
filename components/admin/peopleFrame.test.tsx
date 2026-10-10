import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The five people tabs (Members, Admins, Teams, Invitations, External users)
// draw one frame. Each built its own: the search and the action sat in three
// places, the first row started 65 to 151px down depending on the tab, titles
// were an h2 on one tab and divs on four, actions 32 or 36px, rows 58 to 81px,
// and the skeleton had 6 rows on one tab and 3 on the rest.

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver

type Answer = { data?: unknown; isLoading?: boolean; isError?: unknown }
const state = vi.hoisted(() => ({ mode: "loaded" as "loaded" | "empty" | "loading" }))

const ZERO = "0001-01-01T00:00:00Z"
const people = [
  { user_uuid: "u1", user_name: "Priya Raman", user_full_name: "Priya Raman", user_email_id: "priya@kestrel.example", user_profile_object_key: "", user_deleted_at: ZERO },
  { user_uuid: "u2", user_name: "Arjun Mehta", user_full_name: "Arjun Mehta", user_email_id: "arjun@kestrel.example", user_profile_object_key: "", user_deleted_at: ZERO },
]
const teams = [{ team_uuid: "t1", team_name: "Design", team_member_count: 4, team_deleted_at: ZERO }]
const invitations = [{ id: "i1", email: "elif@kestrel.example", invited_by: "priya@kestrel.example", status: "sent", expires_in_days: 6, invite_link: "https://x/signup?token=a", created_at: "2026-10-09T10:14:00Z" }]
const external = [{ user_uuid: "x1", user_email_id: "jordan@harborbank.example", user_name: "Jordan Blake", user_profile_object_key: "", github_login: "jblake" }]

function answer(url: string): Answer {
  if (state.mode === "loading") return { data: undefined, isLoading: true }
  const empty = state.mode === "empty"
  if (url.startsWith("/admin/seats")) return { data: { data: { used: 2, limit: 25 } } }
  if (url.startsWith("/admin/getAllUsersList")) return { data: { data: empty ? [] : people, has_more: false } }
  if (url.startsWith("/admin/getAllAdminUsers")) return { data: { data: empty ? [] : people, has_more: false } }
  if (url.startsWith("/admin/getAllTeamList")) return { data: { data: empty ? [] : teams, has_more: false } }
  if (url.startsWith("/admin/getAllInvitations")) return { data: { data: empty ? [] : invitations } }
  if (url.startsWith("/admin/external-users")) return { data: { data: empty ? [] : external, has_more: false } }
  return { data: undefined }
}

// One answer object per address and mode, as SWR keeps an answer between
// renders: a fresh object on every call would look like a new answer to a card
// that copies it into state, and render it again and again.
const answers = new Map<string, Answer & { mutate: () => void }>()
function stable(url: string) {
  const key = `${state.mode} ${url.split("?")[0]}`
  if (!answers.has(key)) answers.set(key, { isError: undefined, isLoading: false, mutate: vi.fn(), ...answer(url) })
  return answers.get(key)!
}

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => stable(url),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1" } }, isLoading: false }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn(async () => true) }) }))
vi.mock("@/services/invitationService", () => ({ resendInvitation: vi.fn() }))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ ui: { createTeam: { isOpen: false } } }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("./AddAdminDialog", () => ({ AddAdminDialog: () => null }))

const { default: UserCard } = await import("./userCard")
const { default: AdminCard } = await import("./adminCard")
const { default: TeamsCard } = await import("./teamCard")
const { default: InvitationCard } = await import("./invitationCard")
const { default: ExternalUsersCard } = await import("./ExternalUsersCard")
const { PEOPLE_SKELETON_ROWS } = await import("./PeopleFrame")

const TABS = [
  { name: "Members", Card: UserCard, search: /search members/i, action: "Invite people", leading: "avatar" },
  { name: "Admins", Card: AdminCard, search: /search admins/i, action: "Add admin", leading: "avatar" },
  { name: "Teams", Card: TeamsCard, search: /search teams/i, action: "New team", leading: "tile" },
  { name: "Invitations", Card: InvitationCard, search: /search invitations/i, action: "Invite people", leading: "tile" },
  { name: "External users", Card: ExternalUsersCard, search: /search external users/i, action: null, leading: "avatar" },
] as const

beforeEach(() => {
  state.mode = "loaded"
})
afterEach(cleanup)

const frameOf = (container: HTMLElement) => container.querySelector("[data-people-frame]") as HTMLElement

describe.each(TABS)("the $name tab", ({ name, Card, search, action, leading }) => {
  it("opens with the frame's header: its name as an h2, then one line", () => {
    const { container } = render(<Card />)
    const frame = frameOf(container)
    expect(frame).toBeTruthy()
    const header = frame.children[0] as HTMLElement
    expect(header.hasAttribute("data-people-header")).toBe(true)
    const h2 = screen.getByRole("heading", { level: 2, name })
    expect(header.contains(h2)).toBe(true)
    expect(h2.className).toContain("text-base")
    // One line, written to fit a phone (about 48 characters at 390px), so the
    // toolbar starts at the same height on every tab.
    const description = header.querySelector("p") as HTMLElement
    expect(description.className).toContain("truncate")
    expect(description.textContent!.length).toBeLessThanOrEqual(48)
  })

  it("has its search and its one action in the toolbar row, always the frame's second row", () => {
    const { container } = render(<Card />)
    const toolbar = frameOf(container).children[1] as HTMLElement
    expect(toolbar.hasAttribute("data-people-toolbar")).toBe(true)
    expect(toolbar.className).toContain("h-11")
    expect(toolbar.className).toContain("md:h-8")
    const field = screen.getByRole("searchbox", { name: search })
    expect(toolbar.contains(field)).toBe(true)
    // 32px from md up, 44px on a phone (the field's own floor there).
    expect(field.className).toMatch(/(^|\s)h-8(\s|$)/)
    expect(field.className).toContain("max-md:h-11")
    if (action) {
      const button = screen.getAllByRole("button", { name: action })[0]
      expect(toolbar.contains(button)).toBe(true)
      expect(button.className).toContain("h-11")
      expect(button.className).toContain("md:h-8")
    } else {
      expect(toolbar.querySelectorAll("button").length).toBe(0)
    }
  })

  it(`loads as ${PEOPLE_SKELETON_ROWS} of the rows it will show, under the same header and toolbar`, () => {
    state.mode = "loading"
    const { container } = render(<Card />)
    const frame = frameOf(container)
    expect(frame.children[1].hasAttribute("data-people-toolbar")).toBe(true)
    const skeleton = frame.querySelector("ul[aria-busy='true']") as HTMLElement
    expect(skeleton.className).toMatch(/divide-y/)
    const rows = skeleton.querySelectorAll(":scope > li")
    expect(rows.length).toBe(PEOPLE_SKELETON_ROWS)
    expect(rows[0].className).toContain("min-h-14")
    const mark = rows[0].querySelector(".size-9") as HTMLElement
    expect(mark.className).toContain(leading === "avatar" ? "rounded-full" : "rounded-lg")
  })

  it("draws every row in one anatomy: a 36px mark, two lines, its actions at the end", () => {
    const { container } = render(<Card />)
    const row = container.querySelector("[data-person-row]") as HTMLElement
    expect(row).toBeTruthy()
    expect(row.className).toContain("min-h-14")
    expect(row.querySelector(".size-9")).toBeTruthy()
    const lines = row.querySelectorAll(".leading-5, .leading-4")
    expect(lines.length).toBe(2)
    // On a phone the actions take a line of their own, with their words.
    const actions = row.querySelector("[data-person-actions]") as HTMLElement
    expect(actions.className).toContain("w-full")
    for (const b of Array.from(actions.querySelectorAll("button"))) {
      expect(b.querySelector(".sm\\:sr-only")?.textContent).toBeTruthy()
      expect(b.className).toContain("h-11")
      expect(b.className).toContain("sm:h-8")
    }
  })

  it("says a search matched nobody with the tile, a description and Clear search", async () => {
    const { container } = render(<Card />)
    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox", { name: search }), { target: { value: "zzzz" } })
    })
    const state = container.querySelector("[data-people-state]") as HTMLElement
    expect(state).toBeTruthy()
    expect(state.querySelector(".hue-sky [data-empty-icon]")).toBeTruthy()
    expect(state.querySelector("p")?.textContent).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect((screen.getByRole("searchbox", { name: search }) as HTMLInputElement).value).toBe("")
  })
})

describe("a people tab with nothing in it yet", () => {
  it.each(TABS.filter((t) => t.name !== "Members" && t.name !== "Admins"))(
    "welcomes the first $name with the welcome spot",
    ({ Card }) => {
      state.mode = "empty"
      const { container } = render(<Card />)
      const state_ = container.querySelector("[data-people-state]") as HTMLElement
      expect(state_.querySelector("[data-empty-illustration] svg")).toBeTruthy()
    },
  )
})

// At 390 the toolbar's search is about 220px wide: "Search by name or
// email…" was cut to "Search by name or e". Each tab says "Search <them>…".
describe("the people search's placeholder", () => {
  it("is short enough for a phone's toolbar on every tab", async () => {
    const { readFileSync } = await import("node:fs")
    for (const f of ["userCard", "adminCard", "teamCard", "invitationCard", "ExternalUsersCard"]) {
      const m = readFileSync(`components/admin/${f}.tsx`, "utf8").match(/placeholder: "([^"]+)"/)
      expect(m?.[1], f).toMatch(/^Search [a-z ]+…$/)
      expect(m![1].length, f).toBeLessThanOrEqual(24)
    }
  })
})
