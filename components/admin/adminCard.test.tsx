import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The Admins tab: its add button keeps its name on a phone, removing an admin
// asks first and names them, your own row says why it can't be removed, and a
// list that failed to load says so instead of claiming there are no admins.

// jsdom has no IntersectionObserver; the list watches its end with one.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver

const ZERO = "0001-01-01T00:00:00Z"
const priya = { user_uuid: "u1", user_name: "Priya Raman", user_full_name: "Priya Raman", user_email_id: "priya@kestrel.example", user_deleted_at: ZERO }
const arjun = { user_uuid: "u2", user_name: "Arjun Mehta", user_full_name: "Arjun Mehta", user_email_id: "arjun@kestrel.example", user_deleted_at: ZERO }

const state = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => state.list,
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1" } }, isLoading: false }),
}))
const post = vi.hoisted(() => ({ makeRequest: vi.fn(), isSubmitting: false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => post }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("./AddAdminDialog", () => ({ AddAdminDialog: () => null }))

const { default: AdminCard } = await import("./adminCard")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.list = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
})

describe("the Admins tab", () => {
  it("keeps the add button's words on a phone", () => {
    state.list = { data: { data: [priya], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<AdminCard />)
    const add = screen.getByRole("button", { name: "Add admin" })
    // The label used to hide below an xs: breakpoint that does not exist, so a
    // phone showed a bare "+" with no name at all.
    expect(add.querySelector(".hidden")).toBeNull()
  })

  it("asks before removing an admin, and names them", async () => {
    state.list = { data: { data: [priya, arjun], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    post.makeRequest.mockResolvedValue({})
    render(<AdminCard />)
    fireEvent.click(screen.getByRole("button", { name: "Remove Arjun Mehta as an admin" }))
    expect(post.makeRequest).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Remove Arjun Mehta as an admin?",
      confirmText: "Remove admin",
      destructive: true,
    }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(post.makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { user_uuid: "u2" } }))
  })

  it("says why your own row can't be removed, on a button that can still be hovered", () => {
    state.list = { data: { data: [priya, arjun], has_more: false }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<AdminCard />)
    const own = screen.getByRole("button", { name: /You can't remove yourself/ })
    // disabled swallows the pointer, so the tooltip with the reason never showed.
    expect(own.hasAttribute("disabled")).toBe(false)
    expect(own.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(own)
    expect(confirm).not.toHaveBeenCalled()
  })

  it("loads as the rows it will show, in one bordered list", () => {
    state.list = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    const { container } = render(<AdminCard />)
    const list = container.querySelector("ul[aria-busy='true']")
    expect(list?.className).toMatch(/divide-y/)
    expect(list?.className).not.toMatch(/space-y/)
  })

  it("says the list failed to load instead of claiming there are no admins", () => {
    const mutate = vi.fn()
    state.list = { data: undefined, isLoading: false, isError: new Error("503"), mutate }
    render(<AdminCard />)
    expect(screen.queryByText(/No administrators found/)).toBeNull()
    expect(screen.getByText("Couldn't load the admins")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })
})
