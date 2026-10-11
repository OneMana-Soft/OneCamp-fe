import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The five people tabs (Members, Admins, Teams, Invitations, External users)
// draw one frame. Each built its own: the search and the action sat in three
// places, the first row started 65 to 151px down depending on the tab, rows
// were 58 to 81px, and each row carried two or three bare icon buttons whose
// meaning was invisible without hovering.
//
// Design v3 (admin A2, mock M3): the page frame names the section, so the
// frame opens on its toolbar; the list has no outer box, a header row on
// --sunken, 52px rows in one anatomy (a 32px mark, a name over a meta line,
// the tab's columns), and every action lives in the row's ⋯ menu.

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
  it("draws no title of its own: the page frame names the section, the frame opens on its toolbar", () => {
    const { container } = render(<Card />)
    const frame = frameOf(container)
    expect(frame.getAttribute("aria-label")).toBe(name)
    expect(frame.querySelector("h1, h2")).toBeNull()
    expect(frame.children[0].hasAttribute("data-people-toolbar")).toBe(true)
  })

  it("has its search and its one action in the 44px toolbar", () => {
    const { container } = render(<Card />)
    const toolbar = frameOf(container).children[0] as HTMLElement
    expect(toolbar.className).toContain("people-toolbar")
    const field = screen.getByRole("searchbox", { name: search })
    expect(toolbar.contains(field)).toBe(true)
    // 32px from md up, 44px on a phone (the field's own floor there).
    expect(field.className).toMatch(/(^|\s)h-8(\s|$)/)
    expect(field.className).toContain("max-md:h-11")
    expect(field.getAttribute("aria-keyshortcuts")).toBe("/")
    if (action) {
      const button = screen.getAllByRole("button", { name: action }).find((b) => toolbar.contains(b))!
      expect(button).toBeTruthy()
      expect(button.className).toContain("md:h-7")
    } else {
      expect(toolbar.querySelectorAll("button").length).toBe(0)
    }
  })

  it(`loads as ${PEOPLE_SKELETON_ROWS} of the rows it will show, in the list's own grid`, () => {
    state.mode = "loading"
    const { container } = render(<Card />)
    const frame = frameOf(container)
    expect(frame.children[0].hasAttribute("data-people-toolbar")).toBe(true)
    const skeleton = frame.querySelector("ul[aria-busy='true']") as HTMLElement
    expect(skeleton.className).toContain("people-rows")
    const rows = skeleton.querySelectorAll(":scope > li")
    expect(rows.length).toBe(PEOPLE_SKELETON_ROWS)
    expect(rows[0].className).toContain("people-row")
    const mark = rows[0].querySelector(".size-8") as HTMLElement
    expect(mark.className).toContain(leading === "avatar" ? "rounded-full" : "rounded-lg")
  })

  it("draws every row in one anatomy: no outer box, a 32px mark, two lines, the ⋯ at the end", () => {
    const { container } = render(<Card />)
    const body = container.querySelector("[data-people-body]") as HTMLElement
    expect(body.className).not.toMatch(/\bborder\b/)
    expect(body.querySelector("[data-people-head]")?.className).toContain("people-head")
    const row = container.querySelector("[data-person-row]") as HTMLElement
    expect(row.className).toContain("people-row")
    expect(row.querySelector("[data-person-mark] .size-8, [data-person-mark] [data-team-mark]")).toBeTruthy()
    expect(row.querySelector("[data-person-name]")?.className).toContain("font-medium")
    expect(row.querySelector(".people-meta")).toBeTruthy()
  })

  it("keeps every action in the row's ⋯ menu, never as bare buttons on the row", () => {
    const { container } = render(<Card />)
    const row = container.querySelector("[data-person-row]") as HTMLElement
    const actions = row.querySelector("[data-person-actions]") as HTMLElement
    const buttons = Array.from(actions.querySelectorAll("button"))
    expect(buttons.length).toBe(1)
    expect(buttons[0].hasAttribute("data-row-menu")).toBe(true)
    expect(buttons[0].getAttribute("aria-haspopup")).toBe("menu")
    // Outside the actions cell, the only button is the row's own way in.
    const others = Array.from(row.querySelectorAll("button")).filter((b) => !actions.contains(b))
    expect(others.length).toBeLessThanOrEqual(1)
  })

  it("says a search matched nobody with the magnifier spot, a description and Clear search", async () => {
    const { container } = render(<Card />)
    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox", { name: search }), { target: { value: "zzzz" } })
    })
    const state = container.querySelector("[data-people-state]") as HTMLElement
    expect(state).toBeTruthy()
    expect(state.querySelector("[data-empty-illustration] svg[data-spot]")).toBeTruthy()
    expect(state.textContent).toMatch(/matches “zzzz”\./)
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect((screen.getByRole("searchbox", { name: search }) as HTMLInputElement).value).toBe("")
  })
})

// The ⋯ shows on hover from a pointer, and must be visible on a touch screen,
// where there is no hover (components/hoverOnlyActions.test.ts's rule).
describe("the row menu on a touch screen", () => {
  it("is hidden only inside @media (hover: hover)", async () => {
    const { readFileSync } = await import("node:fs")
    const css = readFileSync("app/styles/admin/people.css", "utf8")
    const hover = css.indexOf("@media (hover: hover)")
    const hide = css.indexOf(".people-row .people-menu {")
    expect(hover).toBeGreaterThan(-1)
    expect(hide).toBeGreaterThan(hover)
    expect(css.slice(0, hover)).not.toMatch(/\.people-menu\s*\{[^}]*opacity:\s*0/)
  })
})

describe("the members list's columns", () => {
  it("names the role as a word, with a shield for an admin, never a coloured pill", () => {
    const { container } = render(<UserCard />)
    const role = container.querySelector("[data-member-role]") as HTMLElement
    expect(role.textContent).toMatch(/^(Admin|Member)$/)
    expect(role.className).not.toMatch(/bg-/)
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
      // A first run is the 96px spot (the accent tone), not the 64px one.
      expect(state_.querySelector("[data-empty-illustration]")?.className).toContain("size-24")
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
