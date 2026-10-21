import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { pinTestClock } from "@/lib/testing/testClock"

/**
 * The Inbox's Threads tab (chat P2): the threads you follow, unread first, in
 * the Inbox's rows. A row says who started it and where, how many replies it
 * has and how many are new; it opens beside the Inbox and is read; J, K and U
 * work as on every tab; Unread only and the empty and failed states say what
 * the other tabs say.
 */

pinTestClock()

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const JONAS = { user_uuid: "u-jonas", user_full_name: "Jonas Weber" }
const MAYA = { user_uuid: "u-maya", user_full_name: "Maya Chen" }
const SAM = { user_uuid: "u-sam", user_full_name: "Sam Rivera" }
const THREADS = [
  {
    root: "p-1",
    conversation: { kind: "channel", id: "c-1" },
    place: { name: "engineering" },
    message: { html: '<p>Rollback plan for <span data-type="mention" data-id="u-sam@0x1">@Sam Rivera</span></p>', by: JONAS },
    replies: 12,
    new: 3,
    latest: [{ id: "r-1", html: "<p>Done</p>", created_at: ago(5), by: MAYA }],
    last_reply_at: ago(5),
    unread: true,
    follow: "auto",
  },
  {
    root: "m-1",
    conversation: { kind: "dm", id: "u-maya u-sam" },
    place: { people: [MAYA, SAM], count: 2 },
    message: { html: "<p>Lunch?</p>", by: SAM },
    replies: 1,
    new: 0,
    latest: [],
    last_reply_at: ago(60),
    unread: false,
    follow: "on",
  },
]

type Answer = { data?: unknown; isLoading: boolean; isError?: unknown; mutate: () => void }
const { answers, put, toast } = vi.hoisted(() => ({
  answers: new Map<string, Answer>(),
  put: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => answers.get(key) ?? { data: undefined, isLoading: false, isError: undefined, mutate: () => {} },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
}))
vi.mock("@/lib/axiosInstance", () => ({ default: { put, get: vi.fn(), post: vi.fn() }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(), patchCached: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
const { screenIs } = vi.hoisted(() => ({ screenIs: { phone: false } }))
vi.mock("@/hooks/usePhone", () => ({ usePhone: () => screenIs.phone }))
// jsdom lays nothing out, so the virtual list would draw no rows: every row here.
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: <T,>({ items, renderItem, keyExtractor }: { items: T[]; renderItem: (item: T, i: number) => ReactNode; keyExtractor?: (item: T, i: number) => string | number }) => (
    <div>
      {items.map((item, i) => (
        <div key={keyExtractor ? keyExtractor(item, i) : i}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}))

import ThreadsList from "@/components/activity/threadsList"
import type { InboxPane } from "@/components/activity/useInboxListKeys"

// The first page as SWR holds it: a mutate that sets it, as the list's own does.
function serve(threads: unknown[], over: Partial<Answer> = {}) {
  const answer: Answer = {
    data: { data: { threads, unread: threads.filter((t) => (t as { unread: boolean }).unread).length } },
    isLoading: false,
    isError: undefined,
    mutate: vi.fn((next?: unknown) => {
      if (next !== undefined) answer.data = next
    }),
    ...over,
  }
  answers.set("/chat-threads", answer)
  return answer
}

const pane = (shows: Record<string, string> = {}): InboxPane & { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } => ({
  panel: { isOpen: Object.keys(shows).length > 0, data: shows },
  open: vi.fn(),
  close: vi.fn(),
})

beforeEach(() => {
  answers.clear()
  put.mockReset()
  put.mockResolvedValue({ data: {} })
  toast.mockReset()
  screenIs.phone = false
  localStorage.clear()
})
afterEach(cleanup)

const rowLink = (name: RegExp) => screen.getByRole("link", { name })
const rowOf = (el: Element) => el.closest("[data-feed-row]") as HTMLElement
const LAUNCH = /^Jonas Weber in #engineering\. 12 replies, 3 new$/
const LUNCH = /^You in your DM with Maya Chen\. 1 reply$/

describe("a thread you follow, as a row", () => {
  it("says who started it and where, its replies and how many are new, and its words", () => {
    serve(THREADS)
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} />)
    const row = rowOf(rowLink(LAUNCH))
    expect(row.getAttribute("data-feed-key")).toBe("p-1")
    expect(row.hasAttribute("data-unread")).toBe(true)
    expect(row.querySelector("[data-thread-replies]")?.textContent).toBe("12 replies")
    expect(row.querySelector("[data-thread-new]")?.textContent).toBe("3 new")
    // The root's words, with your own mention as the @You chip.
    expect(row.querySelector(".hub-me")?.textContent).toBe("@You")
    expect(row.textContent).toContain("Rollback plan for")
    expect(row.querySelector("[data-kind-badge]")?.getAttribute("data-kind-badge")).toBe("reply")
    // A read one: no dot, no "new".
    const read = rowOf(rowLink(LUNCH))
    expect(read.hasAttribute("data-unread")).toBe(false)
    expect(read.querySelector("[data-thread-new]")).toBeNull()
    expect(rowLink(LUNCH).getAttribute("href")).toBe("/app/chat/u-maya/m-1")
  })

  it("draws one line in Compact, with what's new at its end", async () => {
    serve(THREADS)
    localStorage.setItem("oc_inbox_density", JSON.stringify("compact"))
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} />)
    const row = rowOf(rowLink(LAUNCH))
    expect(row.getAttribute("data-density")).toBe("compact")
    expect(row.querySelector("[data-kind-badge]")).toBeNull()
    expect(row.textContent).toMatch(/Jonas Weber in #engineering · Rollback plan for\s*@You\s*· 3 new/)
  })
})

describe("opening and reading", () => {
  it("opens beside the Inbox and reads it, at once on screen", async () => {
    const answer = serve(THREADS)
    const p = pane()
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} pane={p} />)
    await act(async () => {
      expect(fireEvent.click(rowLink(LAUNCH)), "the link's own navigation is held").toBe(false)
    })
    expect(p.open).toHaveBeenCalledWith({ channelUUID: "c-1", postUUID: "p-1" })
    expect(put).toHaveBeenCalledWith("/chat-threads/p-1/read", { read: true }, { suppressErrorToast: true })
    expect(answer.mutate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unread: 0 }) }), { revalidate: false })
  })

  it("opens as its page on a phone, and with a modifier", async () => {
    serve(THREADS)
    const p = pane()
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} pane={p} />)
    await act(async () => {
      expect(fireEvent.click(rowLink(LAUNCH), { metaKey: true })).toBe(true)
    })
    expect(p.open).not.toHaveBeenCalled()
  })

  it("marks a thread read with U, and unread again", async () => {
    serve(THREADS)
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} />)
    rowLink(LUNCH).focus()
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "u" })
    })
    expect(put).toHaveBeenLastCalledWith("/chat-threads/m-1/read", { read: false }, { suppressErrorToast: true })
    rowLink(LAUNCH).focus()
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "u" })
    })
    expect(put).toHaveBeenLastCalledWith("/chat-threads/p-1/read", { read: true }, { suppressErrorToast: true })
  })

  it("walks the rows with J, and the panel follows, reading each", async () => {
    serve(THREADS)
    const p = pane({ channelUUID: "c-1", postUUID: "p-1" })
    await act(async () => {
      render(<ThreadsList unreadOnly={false} onShowAll={() => {}} pane={p} />)
    })
    // The panel shows it: it's being read, new replies and all.
    const launch = /^Jonas Weber in #engineering\. 12 replies/
    expect(rowOf(rowLink(launch)).getAttribute("data-selected")).toBe("true")
    expect(put).toHaveBeenCalledWith("/chat-threads/p-1/read", { read: true }, { suppressErrorToast: true })
    rowLink(launch).focus()
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "j" })
    })
    expect(document.activeElement).toBe(rowLink(LUNCH))
    expect(p.open).toHaveBeenLastCalledWith({ chatUUID: "u-maya", chatMessageUUID: "m-1" })
  })

  it("puts a read back, with a toast, when the server says no", async () => {
    serve(THREADS)
    put.mockRejectedValueOnce({ response: { status: 503, data: { msg: "That didn't go through." } } })
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} />)
    rowLink(LAUNCH).focus()
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "u" })
    })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't mark it read", variant: "destructive" }))
  })
})

describe("what the tab says with nothing to show", () => {
  it("says how threads arrive, when you follow none", () => {
    serve([])
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} />)
    expect(screen.getByText("No threads you follow")).toBeTruthy()
    expect(screen.getByText("Reply in a thread, or follow one from its menu, and it lands here.")).toBeTruthy()
  })

  it("shows only unread threads under Unread only, and says when there are none", () => {
    serve(THREADS)
    const showAll = vi.fn()
    const { unmount } = render(<ThreadsList unreadOnly onShowAll={showAll} />)
    expect(screen.queryByRole("link", { name: LUNCH })).toBeNull()
    expect(rowLink(LAUNCH)).toBeTruthy()
    unmount()

    serve(THREADS.map((t) => ({ ...t, unread: false, new: 0 })))
    render(<ThreadsList unreadOnly onShowAll={showAll} />)
    expect(screen.getByText("Nothing unread")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show all" }))
    expect(showAll).toHaveBeenCalled()
  })

  it("says a failed read failed, and offers to try again", () => {
    const retry = vi.fn()
    answers.set("/chat-threads", { data: undefined, isLoading: false, isError: new Error("down"), mutate: retry })
    render(<ThreadsList unreadOnly={false} onShowAll={() => {}} />)
    expect(screen.getByText("Your threads aren't loading. Nothing has been lost.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(retry).toHaveBeenCalled()
  })
})
