import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { keyOf } from "@/lib/conversation/types"

// The Conversation model's hosts (chat A1): every conversation on screen sits
// in a ConversationView and every thread in a ThreadPanel; each streams what
// it shows and gives the composers inside it the conversation or thread they
// write to.

vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }) }))
function Target() {
  const target = useComposerTarget()
  return <p data-testid="target">{target ? keyOf(target) : "none"}</p>
}
vi.mock("@/components/rightPanel/channelComments", () => ({ ChannelComments: () => <Target /> }))
vi.mock("@/components/rightPanel/chatComments", () => ({ ChatComments: () => <Target /> }))
vi.mock("@/components/rightPanel/groupChatComments", () => ({ GroupChatComments: () => <Target /> }))

const { ConversationView, useDmConversation } = await import("@/components/conversation/ConversationView")
const { ThreadPanel } = await import("@/components/conversation/ThreadPanel")
const { useComposerTarget } = await import("@/components/conversation/ComposerHost")
const { RealtimeContext } = await import("@/lib/realtime/context")

afterEach(cleanup)

describe("a conversation's host", () => {
  it("streams the conversation while it's shown, and its composers write to it", () => {
    const subs = { subscribe: vi.fn(), unsubscribe: vi.fn() }
    const view = render(
      <RealtimeContext.Provider value={subs}>
        <ConversationView conversation={{ kind: "group", id: "g1" }}><Target /></ConversationView>
      </RealtimeContext.Provider>,
    )
    expect(subs.subscribe).toHaveBeenCalledWith({ kind: "group", id: "g1" })
    expect(screen.getByTestId("target").textContent).toBe("group:g1")
    view.unmount()
    expect(subs.unsubscribe).toHaveBeenCalledWith({ kind: "group", id: "g1" })
  })

  it("keeps a DM's view mounted while who reads it becomes known", () => {
    const mounts = vi.fn()
    function Child() {
      useEffect(() => mounts(), [])
      return <Target />
    }
    const subs = { subscribe: vi.fn(), unsubscribe: vi.fn() }
    const view = render(<RealtimeContext.Provider value={subs}><ConversationView conversation={null}><Child /></ConversationView></RealtimeContext.Provider>)
    expect(screen.getByTestId("target").textContent).toBe("none")
    view.rerender(<RealtimeContext.Provider value={subs}><ConversationView conversation={{ kind: "dm", id: "maya sam", other: "maya" }}><Child /></ConversationView></RealtimeContext.Provider>)
    expect(screen.getByTestId("target").textContent).toBe("dm:maya sam")
    expect(mounts).toHaveBeenCalledTimes(1)
    expect(subs.subscribe).toHaveBeenCalledTimes(1)
  })

  it("names a DM by both people, for whoever is signed in", () => {
    function Probe() {
      const c = useDmConversation("maya")
      return <p data-testid="dm">{c ? keyOf(c) : "none"}</p>
    }
    render(<Probe />)
    expect(screen.getByTestId("dm").textContent).toBe("dm:maya sam")
  })
})

describe("a thread's host", () => {
  it("shows the thread's own kind of panel, and its reply box writes to the thread", async () => {
    for (const [thread, key] of [
      [{ in: { kind: "channel" as const, id: "c1" }, root: "p1" }, "channel:c1/thread:p1"],
      [{ in: { kind: "dm" as const, id: "maya sam", other: "maya" }, root: "m1" }, "dm:maya sam/thread:m1"],
      [{ in: { kind: "group" as const, id: "g1" }, root: "m2" }, "group:g1/thread:m2"],
    ] as const) {
      render(<ThreadPanel thread={thread} />)
      expect((await screen.findByTestId("target")).textContent).toBe(key)
      cleanup()
    }
  })
})
