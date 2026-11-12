import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

/**
 * V-699: following a thread on a phone. The thread page's top bar carries the
 * thread's bell (FollowThreadButton, the panel's own, so the thread is read
 * there too), and a message's long-press sheet offers Follow thread or
 * Unfollow thread, as a computer's More menu does. Both read and change the
 * one standing (/chat-threads/{root}/follow); there is no route of their own.
 */

type Standing = { root: string; following: boolean; follow: string }
const { standing, listeners, put, toast } = vi.hoisted(() => ({
  standing: { current: undefined as Standing | undefined },
  listeners: new Set<() => void>(),
  put: vi.fn(),
  toast: vi.fn(),
}))
const setStanding = (next: Standing | undefined) => {
  standing.current = next
  for (const fn of listeners) fn()
}

// The standing as SWR keeps it (a write redraws its readers); every other read
// answers a loaded thread.
vi.mock("@/hooks/useFetch", async () => {
  const { useSyncExternalStore } = await import("react")
  const subscribe = (fn: () => void) => {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }
  return {
    useFetch: (key: string) => {
      const now = useSyncExternalStore(subscribe, () => standing.current)
      if (key.endsWith("/follow"))
        return {
          data: now ? { data: now } : undefined,
          isLoading: !now,
          isError: undefined,
          mutate: (next?: { data: Standing }) => {
            if (next?.data) setStanding(next.data)
          },
        }
      return { data: key ? { data: {} } : undefined, isLoading: false, isError: undefined, mutate: vi.fn(), lastRequestStartedAt: 1 }
    },
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
  }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put, get: vi.fn(), post: vi.fn() } }))
vi.mock("@/lib/swrMutate", async (original) => ({ ...(await original<object>()), appMutate: vi.fn(async () => undefined), patchCached: vi.fn() }))
vi.mock("@/hooks/use-toast", async (original) => ({ ...(await original<object>()), useToast: () => ({ toast }) }))
vi.mock("@/services/commandService", () => ({ fetchCommandCatalog: async () => ({ commands: [] }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ isSubmitting: false, makeRequest: () => new Promise(() => {}) }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({}) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/components/mobileMessage/mobileMessage", () => ({ MobileMessage: () => <div data-testid="root-message" /> }))
vi.mock("@/components/mobileMessage/mobileMessageCommentList", () => ({ MobileMessageCommentList: () => null }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/hooks/useLater", () => ({ useSavedEntry: () => undefined, useLaterActions: () => ({ save: vi.fn(async () => {}), remove: vi.fn(async () => {}) }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => <span data-face="" /> }))
vi.mock("@/components/conversation/pins/PinSheetRow", () => ({ PinSheetRow: () => null }))

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { updateChannelPosts } = await import("@/store/slice/channelSlice")
const { updateChats } = await import("@/store/slice/chatSlice")
const { updateGroupChats } = await import("@/store/slice/groupChatSlice")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { MobilePost } = await import("@/components/mobilePost/mobilePost")
const { MobileChat } = await import("@/components/mobileChatMessage/mobileChat")
const { MobileGroupChat } = await import("@/components/mobileChatMessage/mobileGroupChat")
const { ChannelMessageLongPressDrawer } = await import("@/components/drawers/channelMessageLongPressDrawer")
const { ChatMessageLongPressDrawer } = await import("@/components/drawers/chatMessageLongPressDrawer")
const { GroupChatMessageLongPressDrawer } = await import("@/components/drawers/groupChatMessageLongPressDrawer")
const { useThreadFollow } = await import("@/components/conversation/useThreadFollow")

const CH = "c0ffee00-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const GRP = "9a0b0000-0000-4000-8000-0000000000aa"
const A = "aaaa0000-0000-4000-8000-00000000000a"
const by = { user_uuid: MAYA, user_name: "Maya Chen" }
const post = { post_uuid: A, post_text: "Ship it", post_by: by, post_created_at: "2026-10-13T09:00:00Z", post_comment_count: 2 }
const message = { chat_uuid: A, chat_body_text: "Ship it", chat_from: by, chat_created_at: "2026-10-13T09:00:00Z", chat_comment_count: 2 }
const FOLLOW = `/chat-threads/${A}/follow`
const QUIET = { suppressErrorToast: true }

pinTestClock()

let bar: HTMLElement
beforeEach(() => {
  store.dispatch({ type: RESET_STORE_ACTION })
  store.dispatch(updateChannelPosts({ channelId: CH, posts: [post] } as never))
  store.dispatch(updateChats({ chatId: MAYA, chats: [message] } as never))
  store.dispatch(updateGroupChats({ grpId: GRP, chats: [message] } as never))
  setStanding({ root: A, following: false, follow: "auto" })
  put.mockReset()
  put.mockImplementation(async (url: string, body: { follow?: string }) =>
    url.endsWith("/follow") ? { data: { data: { root: A, following: body.follow === "on", follow: body.follow } } } : { data: {} },
  )
  toast.mockReset()
  // The phone top bar's trailing slot (mobileTopNavigationBar), where a page's own tools go.
  bar = document.createElement("div")
  bar.setAttribute("data-phone-bar-end", "")
  document.body.appendChild(bar)
})
afterEach(() => {
  cleanup()
  bar.remove()
})

const tap = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el)
  })
}

const views = [
  { name: "a channel's thread page", view: <MobilePost channelId={CH} postUUID={A} /> },
  { name: "a DM's thread page", view: <MobileChat chatId={MAYA} chatMessageUUID={A} /> },
  { name: "a group's thread page", view: <MobileGroupChat grpId={GRP} chatMessageUUID={A} /> },
]

describe.each(views)("on a phone, $name", ({ view }) => {
  const show = () =>
    render(
      <Provider store={store}>
        <TooltipProvider>{view}</TooltipProvider>
      </Provider>,
    )

  it("carries the thread's bell in the top bar, which follows the thread and unfollows it", async () => {
    show()
    const bell = await within(bar).findByRole("button", { name: "Follow thread" })
    // One of the bar's own tools: 40px drawn, a 44px reach under a finger (app/phone.css C2, F3).
    expect(bell.parentElement?.hasAttribute("data-phone-bar-actions")).toBe(true)
    expect(bell.hasAttribute("data-touch-target")).toBe(true)
    expect(bell.getAttribute("aria-pressed")).toBe("false")
    await tap(bell)
    expect(put).toHaveBeenCalledWith(FOLLOW, { follow: "on" }, QUIET)
    const on = within(bar).getByRole("button", { name: "Unfollow thread" })
    expect(on.getAttribute("aria-pressed")).toBe("true")
    await tap(on)
    expect(put).toHaveBeenLastCalledWith(FOLLOW, { follow: "off" }, QUIET)
    expect(within(bar).getByRole("button", { name: "Follow thread" }).getAttribute("aria-pressed")).toBe("false")
  })

  it("holds no bell while the standing loads, so a tap can't guess; the bell comes once it has, and follows", async () => {
    setStanding(undefined)
    show()
    await screen.findByTestId("root-message")
    expect(within(bar).queryByRole("button", { name: /follow thread/i })).toBeNull()
    act(() => setStanding({ root: A, following: false, follow: "auto" }))
    await tap(await within(bar).findByRole("button", { name: "Follow thread" }))
    expect(put).toHaveBeenCalledWith(FOLLOW, { follow: "on" }, QUIET)
  })

  it("reads the thread a moment after it opens, as the panel does", async () => {
    show()
    await within(bar).findByRole("button", { name: "Follow thread" })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })
    expect(put).toHaveBeenCalledWith(`/chat-threads/${A}/read`, { read: true }, QUIET)
  })
})

const sheetProps = {
  drawerOpenState: true,
  onAddEmoji: () => {},
  copyTextToClipboard: () => {},
  editMessage: () => {},
  deleteMessage: () => {},
  handleEmojiClick: () => {},
  messageText: "Ship it",
}
const sheets = [
  { name: "a channel message's", sheet: (setOpenState: (open: boolean) => void) => <ChannelMessageLongPressDrawer {...sheetProps} setOpenState={setOpenState} channelUUID={CH} postUUID={A} /> },
  { name: "a DM message's", sheet: (setOpenState: (open: boolean) => void) => <ChatMessageLongPressDrawer {...sheetProps} setOpenState={setOpenState} otherUserUUID={MAYA} chatUUID={A} /> },
  { name: "a group message's", sheet: (setOpenState: (open: boolean) => void) => <GroupChatMessageLongPressDrawer {...sheetProps} setOpenState={setOpenState} grpId={GRP} chatUUID={A} /> },
]

// The one guard (V-699, DB-123 F3): the bell, the More menu's item and the
// sheet's row all change the standing through this hook.
describe("useThreadFollow", () => {
  it("does nothing on toggle while the standing loads, then follows once it has", async () => {
    setStanding(undefined)
    const { result } = renderHook(() => useThreadFollow(A))
    expect(result.current.loading).toBe(true)
    expect(result.current.label).toBe("Follow thread")
    await act(() => result.current.toggle())
    expect(put).not.toHaveBeenCalledWith(FOLLOW, expect.anything(), expect.anything())
    expect(standing.current).toBeUndefined()
    act(() => setStanding({ root: A, following: false, follow: "auto" }))
    expect(result.current.loading).toBe(false)
    await act(() => result.current.toggle())
    expect(put).toHaveBeenCalledWith(FOLLOW, { follow: "on" }, QUIET)
  })
})

describe.each(sheets)("$name long-press sheet", ({ sheet }) => {
  it("offers Follow thread, whether the message has replies yet or not, and closes as it follows", async () => {
    const closed = vi.fn()
    render(sheet(closed))
    const follow = screen.getByRole("button", { name: "Follow thread" })
    await tap(follow)
    expect(put).toHaveBeenCalledWith(FOLLOW, { follow: "on" }, QUIET)
    expect(closed).toHaveBeenCalledWith(false)
  })

  it("is busy while the standing loads: it says so, keeps its spinner, takes no tap, then settles to Follow thread", async () => {
    setStanding(undefined)
    const closed = vi.fn()
    render(sheet(closed))
    const row = screen.getByRole("button", { name: "Follow thread" })
    expect(row.getAttribute("aria-busy")).toBe("true")
    expect(row.querySelector(".animate-spin")).not.toBeNull()
    await tap(row)
    expect(put).not.toHaveBeenCalledWith(FOLLOW, expect.anything(), expect.anything())
    expect(closed).not.toHaveBeenCalled()
    act(() => setStanding({ root: A, following: false, follow: "auto" }))
    const ready = screen.getByRole("button", { name: "Follow thread" })
    expect(ready.hasAttribute("aria-busy")).toBe(false)
    expect(ready.querySelector(".animate-spin")).toBeNull()
    await tap(ready)
    expect(put).toHaveBeenCalledWith(FOLLOW, { follow: "on" }, QUIET)
    expect(closed).toHaveBeenCalledWith(false)
  })

  it("offers Unfollow thread for a thread you follow, and unfollows it", async () => {
    setStanding({ root: A, following: true, follow: "on" })
    render(sheet(() => {}))
    expect(screen.queryByRole("button", { name: "Follow thread" })).toBeNull()
    await tap(screen.getByRole("button", { name: "Unfollow thread" }))
    expect(put).toHaveBeenCalledWith(FOLLOW, { follow: "off" }, QUIET)
  })
})
