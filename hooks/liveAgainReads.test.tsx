import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import { pinTestClock } from "@/lib/testing/testClock"

// When the live connection is back (RealtimeEngine's onSubscribed: the first
// connection after a cold open and every reconnect), the Inbox reads its nudge
// list and its count again: an event sent before then reached no one (V-577).
// What that costs the server, and that a read sent before an answer never
// stands for the read after it.

vi.mock("@/components/common/withFeature", () => ({ withAI: (C: React.ComponentType) => C }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

// The server: every read is held until the test answers it, or fails it.
type Sent = { url: string; answer: (data: unknown) => void; fail: () => void }
const { sent } = vi.hoisted(() => ({ sent: [] as Sent[] }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: (url: string) =>
      new Promise((resolve, reject) => sent.push({ url, answer: (data) => resolve({ data: { data } }), fail: () => reject(new Error("503")) })),
    post: async () => ({ data: {} }),
  },
}))

import nudgeSlice from "@/store/slice/nudgeSlice"
import messageResyncSlice, { triggerMessageCatchUp } from "@/store/slice/messageResyncSlice"
import userSlice from "@/store/slice/userSlice"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { useInboxBadge } from "@/lib/activity/inboxBadge"
import { useActivityMessageHandlers } from "@/hooks/useActivityMessageHandlers"
import InboxNudges from "@/components/ai/InboxNudges"

const NUDGES = "/ai/nudges"
const COUNT = "/activity/unread"
const nudge = (id: string, title: string) => ({ id, title, body: "", kind: "generic", priority: 1, created_at: "2026-10-10T08:00:00Z", cta_url: `/app/task/${id}`, cta_text: "" })
const A = nudge("a", "Overdue commitment")
const C = nudge("c", "Still waiting on an answer?")
const list = (...nudges: ReturnType<typeof nudge>[]) => ({ nudges, open_count: nudges.length })

const reads = (url: string) => sent.filter((s) => s.url === url)
const counts = () => [reads(NUDGES).length, reads(COUNT).length]
const settle = () => act(async () => {})

function Badge() {
  useInboxBadge()
  return null
}
function Live() {
  useActivityMessageHandlers({ userUuid: "sam" })
  return null
}

/** The app's shell: one store, one SWR cache, the badge and the live handlers; the Inbox's group while `inbox`. */
function app() {
  const store = configureStore({ reducer: { nudge: nudgeSlice.reducer, messageResync: messageResyncSlice.reducer, users: userSlice.reducer } })
  const cache = new Map()
  const view = (inbox: boolean) => (
    <SWRConfig value={{ provider: () => cache }}>
      <SWRMutateBridge />
      <Provider store={store}>
        <Badge />
        <Live />
        {inbox && <InboxNudges />}
      </Provider>
    </SWRConfig>
  )
  const ui = render(view(true))
  return {
    store,
    /** A connection's subscriptions answered (RealtimeEngine's onSubscribed). */
    live: () => act(async () => void store.dispatch(triggerMessageCatchUp())),
    show: (inbox: boolean) => ui.rerender(view(inbox)),
    badge: () => store.getState().users.userSidebar.totalUnreadActivityCount,
  }
}

/** Answers every read still out: an empty list and a zero count. */
function answerAll() {
  for (const s of sent) s.answer(s.url === NUDGES ? list() : { count: 0 })
}

afterEach(async () => {
  cleanup()
  for (const s of sent) s.fail() // nothing held over to the next test
  sent.length = 0
  await new Promise((r) => setTimeout(r, 0))
})

describe("reading again when the connection is live again", () => {
  pinTestClock()

  it("reads the list again for each answer, never taking a read sent before it: a flap, two answers within one read (CR-B19 E1)", async () => {
    const { live } = app()
    await settle()
    reads(NUDGES)[0].answer(list(A, C))
    await settle()
    expect(screen.getByText("Still waiting on an answer?")).toBeTruthy()

    await live()
    expect(reads(NUDGES)).toHaveLength(2)
    // C is cleared on the server and its event reaches no one: the connection
    // dropped again, and comes back while the first answer's read is still out.
    await live()
    expect(reads(NUDGES), "the read sent before the second answer can't stand for it").toHaveLength(3)
    reads(NUDGES)[2].answer(list(A))
    reads(NUDGES)[1].answer(list(A, C)) // from before the clear, answered last
    await settle()
    expect(screen.queryByText("Still waiting on an answer?")).toBeNull()
    expect(screen.getByText("Overdue commitment")).toBeTruthy()
  })

  it("on the way back to the Inbox, a list read out from before an answer doesn't stand for the read after it", async () => {
    const { live, show } = app()
    await settle()
    reads(NUDGES)[0].answer(list(A, C))
    await settle()
    show(false)
    show(true)
    await settle()
    expect(reads(NUDGES), "back to the Inbox: its own read").toHaveLength(2)

    // C is cleared while the connection is down; it comes back with that read still out.
    await live()
    expect(reads(NUDGES), "its own read, not the one sent before the answer").toHaveLength(3)
    reads(NUDGES)[2].answer(list(A))
    reads(NUDGES)[1].answer(list(A, C)) // from before the clear, answered last
    await settle()
    expect(screen.queryByText("Still waiting on an answer?")).toBeNull()
  })

  it("reads the list at the next answer after a first read that failed, once (V-607)", async () => {
    const { live } = app()
    await settle()
    reads(NUDGES)[0].fail() // offline on arrival
    await settle()
    expect(reads(NUDGES)).toHaveLength(1)

    await live()
    expect(reads(NUDGES)).toHaveLength(2)
    reads(NUDGES)[1].answer(list(A))
    await settle()
    expect(screen.getByText("Overdue commitment")).toBeTruthy()
    expect(reads(NUDGES)).toHaveLength(2)
  })

  // SWR 2.3.6: mutate(key) runs the key's first revalidator with MUTATE_EVENT
  // (dist/_internal/config-context-client-BoS53ST9.mjs:270-271), which
  // revalidates without dedupe (dist/index/index.mjs:502-503), so a new request
  // starts with one in flight (:289, :344-347) and the older answer is dropped
  // (:365-371).
  it("reads the count again at each answer as a request of its own, and drops an older count answered after it", async () => {
    const { live, badge } = app()
    await settle()
    expect(reads(COUNT)).toHaveLength(1)

    await live()
    expect(reads(COUNT), "a request of its own with the arrival's still out").toHaveLength(2)
    reads(COUNT)[1].answer({ count: 2 })
    reads(COUNT)[0].answer({ count: 1 }) // from before the answer, answered last
    await settle()
    expect(badge()).toBe(2)
  })

  it("costs a cold open one more read of each, at the first answer, and nothing more on the way back to the Inbox", async () => {
    const { live, show } = app()
    await settle()
    expect(counts(), "on arrival: the list and the count").toEqual([1, 1])
    answerAll()
    await settle()

    await live()
    expect(counts(), "the first answer: one more of each").toEqual([2, 2])
    answerAll()
    await settle()

    show(false)
    show(true)
    await settle()
    expect(counts(), "back to the Inbox: the list's own read, no answer, no count").toEqual([3, 2])
  })

  it("on a flapping connection reads each once per answer, and a read that fails is never read again by the signal", async () => {
    const { store, live } = app()
    await settle()
    answerAll()
    await settle()
    expect(counts()).toEqual([1, 1])

    // Three answers in a row, each with every read still out.
    await live()
    await live()
    await live()
    expect(counts(), "one read per key per answer").toEqual([4, 4])
    // Two answers within one render: one read of each for both.
    await act(async () => {
      store.dispatch(triggerMessageCatchUp())
      store.dispatch(triggerMessageCatchUp())
    })
    expect(counts()).toEqual([5, 5])

    for (const s of sent) s.fail()
    await settle()
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(counts(), "a failed read triggers nothing").toEqual([5, 5])
  })
})
