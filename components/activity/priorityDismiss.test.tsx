import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"

import { pinTestClock } from "@/lib/testing/testClock"

/**
 * Priority triage you can clear (A4 H5). A Priority row has "Remove from
 * Priority": the row leaves Priority at once, the tab's count with it, and
 * POST /activity/dismiss carries the server's own key of the row (and of its
 * echoes); once it is written a toast says so with an Undo, which writes it
 * back. A write that fails puts the row back and says so. In All, a row taken
 * out reads "Back to Priority", a tool that lasts past the toast. The server
 * decides what is Priority (an ask over 7 days old reads normal): the web
 * reads `priority` and `dismissed` and adds no rule of its own.
 */

let search = "tab=priority"
const at = "2026-10-10T09:00:00Z"
const jonas = { user_uuid: "u-jonas", user_full_name: "Jonas Weber", user_name: "jonas" }
/** A mention that asks something of the reader, by the server's key. */
const asked = (key: string, text: string, extra: object = {}) => ({
  activity_type: "MENTION",
  key,
  dismissed: false,
  time: at,
  priority: "high",
  unread: true,
  actor_kind: "person",
  mention: {
    mention_created_at: at,
    mention_post_uuid: `post-${key}`,
    mention_post: { post_uuid: `post-${key}`, post_text: text, post_channel: { ch_uuid: "c1", ch_name: "launch" }, post_by: jonas },
  },
  ...extra,
})

// Jonas's mentions of the reader in one thread are one row ("mentioned you 2 times").
const inThread = (key: string, text: string, time: string, extra: object = {}) =>
  asked(key, text, {
    time,
    mention: {
      uid: `m-${key}`,
      mention_created_at: time,
      mention_comment: { comment_uuid: `c-${key}`, comment_text: text, comment_created_at: time, comment_by: jonas, comment_post: { post_uuid: "p-thread", post_channel: { ch_uuid: "c1", ch_name: "launch" } } },
    },
    ...extra,
  })

let items: object[] = []
// One answer per request, as SWR gives: a new object each render would be a new answer each render to the lists' effects.
const answers = new Map<string, unknown>()
function answerFor(url: string) {
  if (!answers.has(url)) {
    const data = url.startsWith("/activity/mentions")
      ? { data: { mentions: [], has_more: false }, msg: "ok" }
      : { data: { activities: items, has_more: false }, msg: "ok" }
    answers.set(url, { data, isLoading: false, isError: undefined, mutate: vi.fn() })
  }
  return answers.get(url)
}

const { setPriorityDismissed } = vi.hoisted(() => ({ setPriorityDismissed: vi.fn<(keys: string[], dismissed: boolean) => Promise<void>>(async () => {}) }))
vi.mock("@/services/activityService", () => ({ markActivitySeen: async () => 0, setPriorityDismissed }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => answerFor(url),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
  useFeature: () => false,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: (to: string) => (search = to.split("?")[1] ?? "") }),
  useSearchParams: () => new URLSearchParams(search),
}))
// The Inbox reads the right panel (the reading pane): closed here.
vi.mock("react-redux", () => ({ useDispatch: () => () => {}, useSelector: () => undefined }))
vi.mock("@/services/unreadCache", () => ({ recountInbox: () => {} }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
// jsdom lays nothing out, so the virtual list would draw no rows: every row here.
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem, keyExtractor }: { items: T[]; renderItem: (item: T, i: number) => ReactNode; keyExtractor?: (item: T, i: number) => string | number }) => (
    <div data-testid="rows">
      {items.map((item, i) => (
        <div key={keyExtractor ? keyExtractor(item, i) : i}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}))

const { ActivityListTabs } = await import("@/components/activity/activityListTabs")
const { Toaster } = await import("@/components/ui/toaster")
const { usePriorityMarks } = await import("@/components/activity/usePriorityMarks")
const { useToast } = await import("@/hooks/use-toast")

pinTestClock()

function inbox() {
  const ui = render(
    <>
      <ActivityListTabs />
      <Toaster />
    </>,
  )
  // The tab's count: its digits, or "" when it draws none (zero). While it
  // ticks, the old digits roll out beside the new: its label is the count.
  const priorityCount = () => {
    const tick = ui.container.querySelector('[data-tab="priority"] [data-count-tick]')
    return (tick?.getAttribute("aria-label") ?? tick?.textContent ?? "").replace(/\D/g, "")
  }
  return { priorityCount }
}

/** The row saying `words`, if it is listed. */
const rowOf = (words: string) => screen.queryByText(new RegExp(words))?.closest("[data-hub-row]") ?? null
/** The names of the row's tools. */
const toolsOf = (words: string) => [...(rowOf(words)?.querySelectorAll(".hub-row-tools :is(button, a)") ?? [])].map((t) => t.getAttribute("aria-label"))
const tool = (words: string, name: string) => {
  const found = [...(rowOf(words)?.querySelectorAll<HTMLElement>(".hub-row-tools button") ?? [])].find((t) => t.getAttribute("aria-label") === name)
  if (!found) throw new Error(`no ${name} on the row saying ${words}`)
  return found
}
/** Lets the write's answer land. */
const settle = () => act(async () => {})

afterEach(() => {
  // Toasts live in one store for the module: the last test's would show in the next one's.
  const toasts = renderHook(() => useToast())
  act(() => toasts.result.current.dismiss())
  cleanup()
  answers.clear()
  items = []
  search = "tab=priority"
  setPriorityDismissed.mockReset()
  setPriorityDismissed.mockImplementation(async () => {})
  window.localStorage.clear()
})

describe("Remove from Priority (A4 H5)", () => {
  it("is on Priority rows only; a row taken out has Back to Priority instead, and a row with no key has neither", () => {
    search = "tab=all"
    items = [
      asked("k1", "Can you check the rollback steps?"),
      asked("k2", "Could you look at the budget?", { priority: "normal", dismissed: true }),
      asked("k3", "Thanks for the launch notes", { priority: "normal" }),
      asked("k4", "Can you send the deck?", { key: undefined }),
    ]
    inbox()
    expect(toolsOf("rollback steps")).toContain("Remove from Priority")
    expect(toolsOf("rollback steps")).not.toContain("Back to Priority")
    expect(toolsOf("the budget")).toContain("Back to Priority")
    expect(toolsOf("the budget")).not.toContain("Remove from Priority")
    expect(toolsOf("launch notes")).not.toContain("Remove from Priority")
    expect(toolsOf("launch notes")).not.toContain("Back to Priority")
    expect(toolsOf("send the deck")).not.toContain("Remove from Priority")
  })

  it("takes the row out at once with the tab's count, writes its key, and once written says so with an Undo", async () => {
    items = [asked("k1", "Can you check the rollback steps?"), asked("k2", "Can you sign off the launch post?")]
    let answer!: () => void
    setPriorityDismissed.mockImplementation(() => new Promise<void>((done) => (answer = done)))
    const { priorityCount } = inbox()
    expect(priorityCount()).toBe("2")

    fireEvent.click(tool("rollback steps", "Remove from Priority"))
    // Gone before the server answers: no wait on the write.
    expect(rowOf("rollback steps")).toBeNull()
    expect(rowOf("launch post")).not.toBeNull()
    expect(priorityCount()).toBe("1")
    expect(setPriorityDismissed).toHaveBeenCalledTimes(1)
    expect(setPriorityDismissed).toHaveBeenCalledWith(["k1"], true)
    expect(screen.queryByText("Removed from Priority")).toBeNull()

    await act(async () => answer())
    expect(await screen.findByText("Removed from Priority")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument()
  })

  it("leaves Priority's own empty state after the last one", async () => {
    items = [asked("k1", "Can you check the rollback steps?")]
    inbox()
    fireEvent.click(tool("rollback steps", "Remove from Priority"))
    await settle()
    expect(rowOf("rollback steps")).toBeNull()
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
  })

  it("takes out every mention one row stands for: the row posts each of their keys", async () => {
    items = [inThread("k1", "Can you check the rollback steps?", at), inThread("k1b", "And the release notes too?", "2026-10-10T08:00:00Z")]
    const { priorityCount } = inbox()
    expect(priorityCount()).toBe("2")
    fireEvent.click(tool("rollback steps", "Remove from Priority"))
    await settle()
    expect(setPriorityDismissed).toHaveBeenCalledWith(["k1", "k1b"], true)
    expect(priorityCount()).toBe("")
  })

  it("a high item that came live, with no key until the feed is fetched again, has no Remove, alone or over keyed mentions", () => {
    // V-1039: an item over MQTT carries its Priority but not its key. Posting
    // only the others' keys would leave the row in Priority, so there is none.
    items = [
      inThread("k1", "Can you check the rollback steps?", at, { key: undefined }),
      inThread("k1b", "And the release notes too?", "2026-10-10T08:00:00Z"),
      asked("k4", "Can you send the deck?", { key: undefined }),
    ]
    inbox()
    expect(toolsOf("rollback steps")).not.toContain("Remove from Priority")
    expect(toolsOf("send the deck")).not.toContain("Remove from Priority")
    expect(setPriorityDismissed).not.toHaveBeenCalled()
  })

  it("Undo writes it back, and the row and its count return", async () => {
    items = [asked("k1", "Can you check the rollback steps?")]
    const { priorityCount } = inbox()
    fireEvent.click(tool("rollback steps", "Remove from Priority"))
    await settle()
    expect(priorityCount()).toBe("")
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }))
    await settle()
    expect(setPriorityDismissed).toHaveBeenLastCalledWith(["k1"], false)
    expect(rowOf("rollback steps")).not.toBeNull()
    expect(priorityCount()).toBe("1")
    expect(toolsOf("rollback steps")).toContain("Remove from Priority")
  })

  it("a write that fails (offline, a server fault) puts the row back and says it didn't, with no Undo", async () => {
    items = [asked("k1", "Can you check the rollback steps?")]
    setPriorityDismissed.mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }))
    const { priorityCount } = inbox()
    fireEvent.click(tool("rollback steps", "Remove from Priority"))
    expect(rowOf("rollback steps")).toBeNull()
    await settle()
    expect(rowOf("rollback steps")).not.toBeNull()
    expect(priorityCount()).toBe("1")
    expect(await screen.findByText("Couldn't take it out of Priority")).toBeInTheDocument()
    expect(screen.queryByText("Removed from Priority")).toBeNull()
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  })

  it("in All, a row taken out reads Back to Priority, which puts it back in Priority's count", async () => {
    search = "tab=all"
    items = [asked("k2", "Could you look at the budget?", { priority: "normal", dismissed: true })]
    const { priorityCount } = inbox()
    expect(priorityCount()).toBe("")
    fireEvent.click(tool("the budget", "Back to Priority"))
    expect(setPriorityDismissed).toHaveBeenCalledWith(["k2"], false)
    expect(priorityCount()).toBe("1")
    expect(toolsOf("the budget")).toContain("Remove from Priority")
    await settle()
    expect(await screen.findByText("Back in Priority")).toBeInTheDocument()
  })
})

// F1 (CR-333): a double press, and two writes for one key at once.
/** A write the server holds until the test lets it answer: true writes it, false fails it. */
function held() {
  let answer: (ok: boolean) => void = () => {}
  const write = new Promise<void>((done, fail) => {
    answer = (ok) => (ok ? done() : fail(new Error("offline")))
  })
  return { write, answer: (ok: boolean) => act(async () => answer(ok)) }
}
/** The rows as listed, top to bottom. */
const listed = () => [...document.querySelectorAll<HTMLElement>('[data-testid="rows"] [data-hub-row]')]
/** A row's own tool by its name. */
const toolIn = (row: HTMLElement, name: string) => {
  const found = [...row.querySelectorAll<HTMLElement>(".hub-row-tools button")].find((t) => t.getAttribute("aria-label") === name)
  if (!found) throw new Error(`no ${name} on the row`)
  return found
}
const three = () => [
  asked("k1", "First, the budget?", { time: "2026-10-10T09:03:00Z" }),
  asked("k2", "Second, the venue?", { time: "2026-10-10T09:02:00Z" }),
  asked("k3", "Third, the date?", { time: "2026-10-10T09:01:00Z" }),
]

describe("Remove from Priority, pressed twice (CR-333 F1)", () => {
  it("the second click of a double press lands on the next row's Remove, and posts nothing", () => {
    items = three()
    inbox()
    const [first] = listed()
    fireEvent.click(toolIn(first, "Remove from Priority"), { detail: 1 })
    const [next] = listed()
    expect(next).not.toBe(first)
    fireEvent.click(toolIn(next, "Remove from Priority"), { detail: 2 })
    expect(setPriorityDismissed).toHaveBeenCalledTimes(1)
    expect(listed()).toHaveLength(2)
  })

  it("in All, a press while the row's write is in flight posts nothing; once it settles the tool works again", async () => {
    search = "tab=all"
    items = [asked("k1", "Could you look at the budget?")]
    const server = held()
    setPriorityDismissed.mockImplementationOnce(() => server.write)
    inbox()
    fireEvent.click(tool("the budget", "Remove from Priority"), { detail: 1 })
    fireEvent.click(tool("the budget", "Back to Priority"), { detail: 1 })
    expect(setPriorityDismissed).toHaveBeenCalledTimes(1)
    await server.answer(true)
    fireEvent.click(tool("the budget", "Back to Priority"), { detail: 1 })
    expect(setPriorityDismissed).toHaveBeenCalledTimes(2)
    expect(setPriorityDismissed).toHaveBeenLastCalledWith(["k1"], false)
  })

  it("orders one key's writes: Back, chosen while Remove is held, posts only once Remove has settled", async () => {
    const server = held()
    setPriorityDismissed.mockImplementationOnce(() => server.write)
    const { result } = renderHook(() => usePriorityMarks())
    act(() => void result.current.choose(["k1"], true))
    act(() => void result.current.choose(["k1"], false))
    expect(setPriorityDismissed).toHaveBeenCalledTimes(1)
    expect(result.current.marks.get("k1")).toBe(false)
    await server.answer(true)
    await settle()
    expect(setPriorityDismissed).toHaveBeenCalledTimes(2)
    expect(setPriorityDismissed).toHaveBeenLastCalledWith(["k1"], false)
    expect(result.current.marks.get("k1")).toBe(false)
  })

  it("leaves the mark on the server's last answer: both writes failing leave none, a failed second leaves the first", async () => {
    const w1 = held()
    const w2 = held()
    setPriorityDismissed.mockImplementationOnce(() => w1.write).mockImplementationOnce(() => w2.write)
    const { result } = renderHook(() => usePriorityMarks())
    act(() => void result.current.choose(["k1"], true))
    act(() => void result.current.choose(["k1"], false))
    await w1.answer(false)
    await settle()
    await w2.answer(false)
    await settle()
    expect(result.current.marks.has("k1")).toBe(false)

    const w3 = held()
    const w4 = held()
    setPriorityDismissed.mockImplementationOnce(() => w3.write).mockImplementationOnce(() => w4.write)
    act(() => void result.current.choose(["k2"], true))
    act(() => void result.current.choose(["k2"], false))
    await w3.answer(true)
    await settle()
    await w4.answer(false)
    await settle()
    expect(result.current.marks.get("k2")).toBe(true)
  })
})

// F2 (CR-333): a row that leaves Priority by its own tool hands the focus on, never to <body>.
describe("the focus after Remove from Priority (CR-333 F2)", () => {
  const focusedRow = () => document.activeElement?.closest("[data-hub-row]") ?? null

  it("from the row's toolbar: to the next row, else the one before, else the Priority tab", async () => {
    items = three()
    inbox()
    const [a, b, c] = listed()
    toolIn(b, "Remove from Priority").focus()
    fireEvent.click(toolIn(b, "Remove from Priority"), { detail: 1 })
    await waitFor(() => expect(focusedRow()).toBe(c))
    fireEvent.click(toolIn(c, "Remove from Priority"), { detail: 1 })
    await waitFor(() => expect(focusedRow()).toBe(a))
    fireEvent.click(toolIn(a, "Remove from Priority"), { detail: 1 })
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-tab="priority"]')))
    expect(document.activeElement).not.toBe(document.body)
  })

  it("from the row's drawer (a phone): to the next row, not to <body> with the row's Actions", async () => {
    items = three()
    inbox()
    const [a, b] = listed()
    fireEvent.keyDown(within(a).getByRole("button", { name: "Actions" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from Priority" }))
    await waitFor(() => expect(setPriorityDismissed).toHaveBeenCalledWith(["k1"], true))
    await waitFor(() => expect(focusedRow()).toBe(b))
  })
})
