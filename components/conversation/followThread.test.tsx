import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TEST_TODAY } from "@/lib/testing/testClock"

/**
 * Following a thread (chat P2): a bell in the thread's header and "Follow
 * thread" in a message's More menu, at once on screen and put back with a
 * toast when the server says no; and a thread on screen is read, again as
 * replies arrive.
 */

type Standing = { root: string; following: boolean; follow: string }
const { standing, put, toast, mutated } = vi.hoisted(() => ({
  standing: { current: undefined as Standing | undefined },
  put: vi.fn(),
  toast: vi.fn(),
  mutated: [] as unknown[],
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({
    data: key && standing.current ? { data: standing.current } : undefined,
    isLoading: false,
    isError: undefined,
    mutate: (next?: { data: Standing }) => {
      mutated.push(next)
      if (next?.data) standing.current = next.data
    },
  }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put, get: vi.fn(), post: vi.fn() } }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(async () => undefined), patchCached: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

import { FollowThreadButton } from "@/components/conversation/FollowThread"
import { FollowMenuItem } from "@/components/conversation/FollowMenuItem"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { TooltipProvider } from "@/components/ui/tooltip"

beforeEach(() => {
  standing.current = { root: "p-1", following: false, follow: "auto" }
  put.mockReset()
  put.mockImplementation(async (url: string, body: { follow?: string }) =>
    url.endsWith("/follow") ? { data: { data: { root: "p-1", following: body.follow === "on", follow: body.follow } } } : { data: {} },
  )
  toast.mockReset()
  mutated.length = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const header = (replies = 2) => (
  <TooltipProvider>
    <FollowThreadButton root="p-1" replies={replies} />
  </TooltipProvider>
)

describe("the bell in a thread's header", () => {
  it("follows the thread, at once, then as the server says", async () => {
    const { rerender } = render(header())
    const bell = screen.getByRole("button", { name: "Follow thread" })
    expect(bell.getAttribute("aria-pressed")).toBe("false")
    await act(async () => {
      fireEvent.click(bell)
    })
    expect(put).toHaveBeenCalledWith("/chat-threads/p-1/follow", { follow: "on" }, { suppressErrorToast: true })
    expect(mutated[0]).toEqual({ data: { root: "p-1", following: true, follow: "on" } })
    rerender(header())
    const following = screen.getByRole("button", { name: "Unfollow thread" })
    expect(following.getAttribute("aria-pressed")).toBe("true")
    // Pressed is the tint and a filled accent bell; the layer's ring would read as focus.
    expect(following.className).toContain("[--tw-inset-ring-shadow:0_0_#0000]")
    expect(following.querySelector("svg")?.getAttribute("class")).toContain("fill-current")
  })

  it("is put back, with the server's words, when it says no", async () => {
    put.mockRejectedValueOnce({ response: { status: 404, data: { msg: "That thread isn't there any more." } } })
    render(header())
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Follow thread" }))
    })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't follow the thread", description: "That thread isn't there any more.", variant: "destructive" }))
  })

  it("draws nothing until the standing is known", () => {
    standing.current = undefined
    render(header())
    expect(screen.queryByRole("button", { name: /follow thread/i })).toBeNull()
  })
})

describe("a thread on screen", () => {
  it("is read a moment after it opens, and again as replies arrive", async () => {
    vi.useFakeTimers({ now: TEST_TODAY, toFake: ["setTimeout", "clearTimeout", "Date"] })
    const { rerender } = render(header(2))
    expect(put).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    const reads = () => put.mock.calls.filter(([url]) => String(url).endsWith("/read"))
    expect(reads()).toEqual([["/chat-threads/p-1/read", { read: true }, { suppressErrorToast: true }]])
    // The same thread with the same replies: nothing more.
    rerender(header(2))
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(reads()).toHaveLength(1)
    // A reply arrives while it's open: read again.
    rerender(header(3))
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(reads()).toHaveLength(2)
  })
})

describe("Follow thread in a message's More menu", () => {
  it("says what choosing it does, and does it", async () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent>
          <FollowMenuItem root="p-1" />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const item = screen.getByRole("menuitem", { name: "Follow thread" })
    await act(async () => {
      fireEvent.click(item)
    })
    expect(put).toHaveBeenCalledWith("/chat-threads/p-1/follow", { follow: "on" }, { suppressErrorToast: true })
  })
})
