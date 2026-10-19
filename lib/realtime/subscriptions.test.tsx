import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { createRealtimeSubscriptions } from "@/lib/realtime/subscriptions"
import { RealtimeContext, useConversationStream } from "@/lib/realtime/context"
import type { ConversationRef } from "@/lib/conversation/types"
import type { RealtimeSubscriptions } from "@/lib/realtime/types"

// Realtime Subscriptions by conversation (chat A1): a surface showing a
// conversation holds it; one the settings don't name has them asked for
// again, once; settings that name none ask for nothing.

const CH: ConversationRef = { kind: "channel", id: "c1" }
const DM: ConversationRef = { kind: "dm", id: "maya sam", other: "maya" }

afterEach(cleanup)

describe("subscriptions by conversation", () => {
  it("count each conversation once however many surfaces hold it", () => {
    const subs = createRealtimeSubscriptions({ names: () => true, refresh: vi.fn() })
    subs.subscribe(CH)
    subs.subscribe(CH)
    subs.subscribe(DM)
    expect([subs.held(CH), subs.held(DM)]).toEqual([2, 1])
    subs.unsubscribe(CH)
    subs.unsubscribe(DM)
    expect([subs.held(CH), subs.held(DM)]).toEqual([1, 0])
  })

  it("ask for the settings again, once, for a conversation they don't name", () => {
    const refresh = vi.fn()
    const named = new Set(["dm:maya sam"])
    const subs = createRealtimeSubscriptions({ names: (key) => named.has(key), refresh })
    subs.subscribe(DM)
    expect(refresh).not.toHaveBeenCalled()
    subs.subscribe(CH)
    subs.subscribe(CH)
    expect(refresh).toHaveBeenCalledTimes(1)
    // Let go and shown again: asked again, as it may have been added since.
    subs.unsubscribe(CH)
    subs.unsubscribe(CH)
    subs.subscribe(CH)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("ask for nothing when the settings name no conversations (an older server)", () => {
    const refresh = vi.fn()
    const subs = createRealtimeSubscriptions({ names: () => undefined, refresh })
    subs.subscribe(CH)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("a surface's stream", () => {
  function Surface({ conversation }: { conversation: ConversationRef | null }) {
    useConversationStream(conversation)
    return null
  }

  it("holds its conversation while mounted, once for the same one, and lets go when it goes", () => {
    const subs: RealtimeSubscriptions = { subscribe: vi.fn(), unsubscribe: vi.fn() }
    const view = render(<RealtimeContext.Provider value={subs}><Surface conversation={{ kind: "channel", id: "c1" }} /></RealtimeContext.Provider>)
    // The same conversation in a new object changes nothing.
    view.rerender(<RealtimeContext.Provider value={subs}><Surface conversation={{ kind: "channel", id: "c1" }} /></RealtimeContext.Provider>)
    expect(subs.subscribe).toHaveBeenCalledTimes(1)
    view.rerender(<RealtimeContext.Provider value={subs}><Surface conversation={{ kind: "group", id: "g1" }} /></RealtimeContext.Provider>)
    expect(subs.unsubscribe).toHaveBeenCalledWith({ kind: "channel", id: "c1" })
    expect(subs.subscribe).toHaveBeenLastCalledWith({ kind: "group", id: "g1" })
    view.unmount()
    expect(subs.unsubscribe).toHaveBeenLastCalledWith({ kind: "group", id: "g1" })
  })

  it("does nothing for no conversation, or with no connection", () => {
    const subs: RealtimeSubscriptions = { subscribe: vi.fn(), unsubscribe: vi.fn() }
    render(<RealtimeContext.Provider value={subs}><Surface conversation={null} /></RealtimeContext.Provider>)
    render(<Surface conversation={{ kind: "channel", id: "c1" }} />)
    expect(subs.subscribe).not.toHaveBeenCalled()
  })
})
