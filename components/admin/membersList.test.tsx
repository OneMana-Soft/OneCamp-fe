import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The Members tab at the size of a real company: 520 people, fetched in pages
// the way the server pages them (first pageSize+1, newest first).

const state = vi.hoisted(() => ({
  /** Pages from this index on are still loading. */
  answeredPages: Infinity,
  /** Pages from this index on fail. */
  failingPages: Infinity,
  retried: 0,
  /** Each row render asks for its avatar once: calls per profile key = renders per row. */
  avatarCalls: new Map<string, number>(),
  urls: [] as string[],
  /** What the card asked usePost to send. */
  requests: [] as Record<string, unknown>[],
  people: Array.from({ length: 520 }, (_, i) => ({
    user_uuid: `u-${i}`,
    user_name: `person${i}`,
    user_full_name: i === 497 ? "Astrid Duarte" : `Person Number${i}`,
    user_email_id: i === 497 ? "astrid.duarte@kestrel.example" : `person${i}@kestrel.example`,
    user_profile_object_key: `k-u-${i}`,
    user_deleted_at: "0001-01-01T00:00:00Z",
  })),
}))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    state.urls.push(url)
    if (url.startsWith("/admin/getAllUsersList")) {
      const q = new URLSearchParams(url.split("?")[1])
      const pageIndex = Number(q.get("pageIndex"))
      const pageSize = Number(q.get("pageSize"))
      if (pageIndex >= state.failingPages) return { data: undefined, isLoading: false, isError: new Error("503"), mutate: () => { state.retried++ } }
      if (pageIndex >= state.answeredPages) return { data: undefined, isLoading: true, isError: undefined, mutate: () => {} }
      const slice = state.people.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize + 1)
      return { data: { data: slice.slice(0, pageSize), has_more: slice.length > pageSize }, isLoading: false, isError: undefined, mutate: () => {} }
    }
    return { data: undefined, isLoading: false, isError: undefined, mutate: () => {} }
  },
}))
vi.mock("@/hooks/useUserAvatar", () => ({
  useUserAvatar: (key?: string | null) => {
    if (key) state.avatarCalls.set(key, (state.avatarCalls.get(key) ?? 0) + 1)
    return { src: undefined, isExternalURL: false, isLoading: false }
  },
}))
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: (o: Record<string, unknown>) => {
      state.requests.push(o)
      return Promise.resolve()
    },
    isSubmitting: false,
  }),
}))
// Confirms at once: what is under test is what happens after the confirm.
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (o: { onConfirm?: () => void }) => o.onConfirm?.() }))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))

const { default: UserCard } = await import("@/components/admin/userCard")

// 520 rows typed through letter by letter take 2 to 4 s alone, and three times
// that with the whole suite running beside them: past the 5 s default, a
// timeout that says nothing about the list.
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  state.answeredPages = Infinity
  state.failingPages = Infinity
  state.retried = 0
  state.avatarCalls.clear()
  state.urls.length = 0
  state.requests.length = 0
})
afterEach(cleanup)

const search = () => screen.getByRole("searchbox", { name: /search members/i })
const type = async (value: string) => {
  await act(async () => {
    fireEvent.change(search(), { target: { value } })
  })
}

describe("the members list", () => {
  // Search ran only over the rows already loaded, 20 at a time and only as the
  // list was scrolled, so in a 520-person workspace "Astrid Duarte" was "No
  // users match your search" until someone scrolled four hundred rows down.
  it("finds a member who isn't on the first page", async () => {
    render(<UserCard />)
    await type("astrid")
    expect(await screen.findByText(/Astrid Duarte/)).toBeInTheDocument()
  })

  it("says it is still looking, not that nobody matches, while the rest are loading", async () => {
    state.answeredPages = 1
    render(<UserCard />)
    await type("astrid")
    expect(screen.getByRole("status").textContent).toMatch(/looking through everyone/i)
    expect(screen.queryByText(/no members match/i)).toBeNull()
  })

  it("says nobody matches when everyone is loaded, and offers to clear the search", async () => {
    render(<UserCard />)
    await type("zzzz")
    expect(screen.getByRole("heading", { name: /no members match “zzzz”/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }))
    expect((search() as HTMLInputElement).value).toBe("")
  })

  // Every keystroke re-rendered every row (with its avatar, tooltips and
  // dialog root): 520 rows per letter. A row that stays in the results
  // doesn't render again.
  it("doesn't re-render the rows that stay in the results while typing", async () => {
    render(<UserCard />)
    // "Person Number10" matches "person number1" and "person number", and is
    // never the first row of either (the first row drops its hairline).
    await type("person number1")
    const before = state.avatarCalls.get("k-u-10") ?? 0
    expect(before).toBeGreaterThan(0)
    await type("person number")
    await type("person number1")
    expect(state.avatarCalls.get("k-u-10") ?? 0).toBe(before)
  })

  it("holds the list's own shape while the first page loads", () => {
    state.answeredPages = 0
    const { container } = render(<UserCard />)
    const skeleton = container.querySelector("[aria-busy='true']") as HTMLElement
    expect(skeleton).not.toBeNull()
    // One bordered list of hairline rows, like the loaded list, not spaced cards.
    expect(skeleton.className).toContain("divide-y")
    expect(skeleton.className).toContain("border")
    expect(skeleton.querySelectorAll(":scope > li").length).toBeGreaterThan(3)
    // Nothing under the skeleton: "Loading the rest… 0 so far" belongs under rows.
    expect(screen.queryByText(/loading the rest/i)).toBeNull()
  })

  it("asks for a hundred at a time, so 520 people are six requests, not twenty-six", () => {
    render(<UserCard />)
    const pages = state.urls.filter((u) => u.startsWith("/admin/getAllUsersList"))
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.every((u) => /pageSize=100\b/.test(u))).toBe(true)
  })

  // A failed first page used to leave the skeleton up for good, and a failed
  // later page left "loading" up for good: neither said anything went wrong.
  // The header said "Members 15" over "Free plan: 14 of 25 people": the list
  // counts a deactivated account, the plan doesn't. The header now says so.
  it("says how many in the count are deactivated, once everyone is loaded", () => {
    const saved = state.people.map((p) => p.user_deleted_at)
    state.people[3].user_deleted_at = "2026-09-30T10:00:00Z"
    state.people[400].user_deleted_at = "2026-10-01T10:00:00Z"
    try {
      render(<UserCard />)
      // One line, so it fits a phone and every people tab's toolbar starts at one height.
      expect(screen.getByText("Everyone with an account here, 2 deactivated.")).toBeInTheDocument()
    } finally {
      state.people.forEach((p, i) => { p.user_deleted_at = saved[i] })
    }
  })

  it("says nothing about deactivated people while the rest are loading", () => {
    state.answeredPages = 1
    const saved = state.people[3].user_deleted_at
    state.people[3].user_deleted_at = "2026-09-30T10:00:00Z"
    try {
      render(<UserCard />)
      expect(screen.getByText("Everyone with an account here.")).toBeInTheDocument()
    } finally {
      state.people[3].user_deleted_at = saved
    }
  })

  // A refused deactivation said "Couldn't deactivate user".
  it("names the person when deactivating them is refused", async () => {
    render(<UserCard />)
    const [first] = screen.getAllByRole("button", { name: /^Deactivate / })
    const name = first.getAttribute("aria-label")!.replace(/^Deactivate /, "")
    await act(async () => void fireEvent.click(first))
    const sent = state.requests.find((r) => String(r.apiEndpoint).includes("deactivate"))
    expect(sent?.failureTitle).toBe(`Couldn't deactivate ${name}`)
    expect(name).not.toMatch(/@/)
  })

  it("says when the members couldn't be loaded, and tries again", () => {
    state.failingPages = 0
    render(<UserCard />)
    expect(screen.getByRole("heading", { name: /couldn't load members/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(state.retried).toBe(1)
  })

  it("says how many are shown when the rest couldn't be loaded, and tries again", () => {
    state.failingPages = 2
    render(<UserCard />)
    expect(screen.getByText(/couldn't load everyone\. 200 are shown\./i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(state.retried).toBe(1)
  })
})
