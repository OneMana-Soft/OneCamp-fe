import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// External users: people created from GitHub. They are rows in one list (each
// was a bordered card), unlinking someone asks first and names them, a list
// that failed to load says so, and an empty list's icon sits on the people
// group's sky tile.

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver

const state = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.list }))
const post = vi.hoisted(() => ({ makeRequest: vi.fn(), isSubmitting: false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => post }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { default: ExternalUsersCard } = await import("./ExternalUsersCard")

const person = { user_uuid: "x1", user_email_id: "octo@users.noreply.github.com", user_name: "Mona Lisa", user_profile_object_key: "", github_login: "mona" }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.list = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
})

describe("external users", () => {
  it("lists people as rows in one bordered list", () => {
    state.list = { data: { data: [person], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<ExternalUsersCard />)
    const row = screen.getByText("Mona Lisa").closest("li")!
    expect(row.parentElement?.className).toMatch(/divide-y/)
    expect(row.className).not.toMatch(/\bborder\b/)
  })

  it("asks before unlinking someone, and names them", async () => {
    state.list = { data: { data: [person], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    post.makeRequest.mockResolvedValue({})
    render(<ExternalUsersCard />)
    fireEvent.click(screen.getByRole("button", { name: "Unlink GitHub account for Mona Lisa" }))
    expect(post.makeRequest).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Unlink Mona Lisa from GitHub?",
      confirmText: "Unlink from GitHub",
      destructive: true,
    }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(post.makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { user_uuid: "x1" } }))
  })

  it("says a failed load failed, with Try again", () => {
    const mutate = vi.fn()
    state.list = { data: undefined, isLoading: false, isError: new Error("503"), mutate }
    render(<ExternalUsersCard />)
    expect(screen.queryByText(/No external users found/)).toBeNull()
    expect(screen.getByText("Couldn't load the external users")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  // One rule on every people tab: nothing ever is a first run, welcomed with
  // the spot in the people group's sky; a search that matched nobody keeps the
  // icon's tile (peopleFrame.test.tsx).
  it("welcomes an empty list with the sky welcome spot, and loads as one bordered list", () => {
    state.list = { data: { data: [], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { unmount } = render(<ExternalUsersCard />)
    expect(document.querySelector("[data-empty-illustration] svg.hue-sky")).toBeTruthy()
    unmount()
    state.list = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    const { container } = render(<ExternalUsersCard />)
    expect(container.querySelector("ul[aria-busy='true']")?.className).toMatch(/divide-y/)
  })
})
