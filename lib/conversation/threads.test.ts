import { afterEach, describe, expect, it, vi } from "vitest"
import { TEST_TODAY } from "@/lib/testing/testClock"

// The app's cache isn't here: what the threads ask of it is recorded.
const { appMutate, patchCached } = vi.hoisted(() => ({ appMutate: vi.fn(), patchCached: vi.fn() }))
vi.mock("@/lib/swrMutate", () => ({ appMutate, patchCached }))
import {
  nameFor,
  newWords,
  placeOf,
  repliesWords,
  threadHref,
  threadsPageKey,
  threadTarget,
  withAllRead,
  withRead,
  type FollowedThread,
  type ThreadsPage,
} from "@/lib/conversation/threads"
import { isThreadsKey, refreshThreadsSoon, THREADS_UNREAD_KEY } from "@/lib/conversation/threadsKey"
import { followsOnReply, threadFollowKey } from "@/lib/conversation/threadFollow"

/**
 * Threads you follow (chat P2): where a thread opens, how its row names its
 * place, the words of its counts, and a page as the server will answer it
 * after a read.
 */

const SAM = "u-sam"
const JONAS = { user_uuid: "u-jonas", user_full_name: "Jonas Weber" }
const ADA = { user_uuid: "u-ada", user_full_name: "Ada Lovelace" }
const ME = { user_uuid: SAM, user_full_name: "Sam Rivera" }

const thread = (over: Partial<FollowedThread> = {}): FollowedThread => ({
  root: "p-1",
  conversation: { kind: "channel", id: "c-1" },
  place: { name: "engineering" },
  message: { html: "<p>Rollback plan</p>", by: JONAS },
  replies: 12,
  new: 3,
  latest: [],
  unread: true,
  follow: "auto",
  ...over,
})

describe("where a thread opens", () => {
  it("opens a channel's post, a DM's or a group's message with its thread", () => {
    expect(threadHref(thread(), SAM)).toBe("/app/channel/c-1/p-1")
    expect(threadTarget(thread(), SAM)).toEqual({ channelUUID: "c-1", postUUID: "p-1" })

    const dm = thread({ conversation: { kind: "dm", id: "u-jonas u-sam" }, root: "m-1" })
    expect(threadHref(dm, SAM)).toBe("/app/chat/u-jonas/m-1")
    expect(threadTarget(dm, SAM)).toEqual({ chatUUID: "u-jonas", chatMessageUUID: "m-1" })

    const group = thread({ conversation: { kind: "group", id: "g-9" }, root: "m-2" })
    expect(threadHref(group, SAM)).toBe("/app/chat/group/g-9/m-2")
    expect(threadTarget(group, SAM)).toEqual({ groupUUID: "g-9", chatMessageUUID: "m-2" })
  })

  it("has no link to a DM while the reader isn't known", () => {
    const dm = thread({ conversation: { kind: "dm", id: "u-jonas u-sam" } })
    expect(threadHref(dm, undefined)).toBeNull()
    expect(threadTarget(dm, undefined)).toBeNull()
  })
})

describe("how a row names its place", () => {
  it("names a channel by its name", () => {
    expect(placeOf(thread(), SAM)).toBe("#engineering")
    expect(placeOf(thread({ place: {} }), SAM)).toBe("a channel")
  })

  it("says 'your DM' for the other person's message, and who it's with for yours", () => {
    const dm = (by: typeof JONAS) => thread({ conversation: { kind: "dm", id: "u-jonas u-sam" }, place: { people: [JONAS, ME], count: 2 }, message: { html: "", by } })
    expect(placeOf(dm(JONAS), SAM)).toBe("your DM")
    expect(placeOf(dm(ME), SAM)).toBe("your DM with Jonas Weber")
  })

  it("names a group by its name, or its people other than you", () => {
    const group = (place: FollowedThread["place"]) => thread({ conversation: { kind: "group", id: "g-1" }, place })
    expect(placeOf(group({ name: "Launch crew", people: [JONAS, ADA, ME], count: 3 }), SAM)).toBe("Launch crew")
    expect(placeOf(group({ people: [JONAS, ADA, ME], count: 3 }), SAM)).toBe("Jonas Weber and Ada Lovelace")
    expect(placeOf(group({ people: [JONAS, ADA, ME], count: 7 }), SAM)).toBe("Jonas Weber, Ada Lovelace and 4 others")
    expect(placeOf(group({ people: [ME], count: 1 }), SAM)).toBe("a group")
  })

  it("calls the reader You", () => {
    expect(nameFor(ME, SAM)).toBe("You")
    expect(nameFor(JONAS, SAM)).toBe("Jonas Weber")
    expect(nameFor(undefined, SAM)).toBe("Someone")
  })
})

describe("the counts' words", () => {
  it("says replies and new ones", () => {
    expect(repliesWords(1)).toBe("1 reply")
    expect(repliesWords(12)).toBe("12 replies")
    expect(newWords({ new: 3 })).toBe("3 new")
    expect(newWords({ new: 20, new_more: true })).toBe("20+ new")
    expect(newWords({ new: 0 })).toBe("")
  })
})

describe("a page after a read", () => {
  const page: ThreadsPage = { threads: [thread(), thread({ root: "p-2", unread: false, new: 0 })], unread: 1 }

  it("reads one thread, or marks it unread again", () => {
    const read = withRead(page, "p-1", true)
    expect(read.unread).toBe(0)
    expect(read.threads[0]).toMatchObject({ unread: false, new: 0 })
    const unread = withRead(read, "p-2", false)
    expect(unread.unread).toBe(1)
    expect(unread.threads[1]).toMatchObject({ unread: true, new: 1 })
    // Nothing to change: the same page.
    expect(withRead(page, "p-2", true)).toBe(page)
    expect(withRead(page, "p-9", true)).toBe(page)
  })

  it("reads them all", () => {
    const all = withAllRead(page)
    expect(all.unread).toBe(0)
    expect(all.threads.every((t) => !t.unread && (t.new === 0 || !t.unread))).toBe(true)
    expect(withAllRead(all)).toBe(all)
  })
})

describe("the threads' keys", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("pages by offset, and names a thread's standing by its root", () => {
    expect(threadsPageKey()).toBe("/chat-threads")
    expect(threadsPageKey(20)).toBe("/chat-threads?offset=20")
    expect(threadFollowKey("p 1")).toBe("/chat-threads/p%201/follow")
    expect(threadFollowKey("")).toBe("")
  })

  it("knows its own reads, and no one else's", () => {
    for (const key of ["/chat-threads", "/chat-threads?offset=20", THREADS_UNREAD_KEY, "/chat-threads/p-1/follow"]) expect(isThreadsKey(key)).toBe(true)
    for (const key of ["/chat-threadsx", "/threads", "/drafts", 42, undefined]) expect(isThreadsKey(key)).toBe(false)
  })

  it("refreshes once for a burst of replies", () => {
    vi.useFakeTimers({ now: TEST_TODAY, toFake: ["setTimeout", "clearTimeout", "Date"] })
    appMutate.mockClear()
    refreshThreadsSoon()
    refreshThreadsSoon()
    refreshThreadsSoon()
    expect(appMutate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(appMutate).toHaveBeenCalledTimes(1)
    expect(appMutate).toHaveBeenCalledWith(isThreadsKey)
    refreshThreadsSoon()
    vi.advanceTimersByTime(1500)
    expect(appMutate).toHaveBeenCalledTimes(2)
  })
})

describe("replying follows the thread", () => {
  it("says so at once in the thread's cached standing, unless you turned it off", () => {
    patchCached.mockClear()
    followsOnReply("p-1")
    expect(patchCached).toHaveBeenCalledTimes(1)
    const [key, update] = patchCached.mock.calls[0] as [string, (env: unknown) => unknown]
    expect(key).toBe("/chat-threads/p-1/follow")
    const auto = { data: { root: "p-1", following: false, follow: "auto" } }
    expect(update(auto)).toEqual({ data: { root: "p-1", following: true, follow: "auto" } })
    // Turned off by hand: that still wins.
    const off = { data: { root: "p-1", following: false, follow: "off" } }
    expect(update(off)).toBe(off)
    // Following already, or nothing cached: nothing to change.
    const on = { data: { root: "p-1", following: true, follow: "on" } }
    expect(update(on)).toBe(on)
    expect(update(undefined)).toBeUndefined()
  })
})
