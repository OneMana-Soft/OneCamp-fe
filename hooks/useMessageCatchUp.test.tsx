import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import store from "@/store/store"
import { triggerMessageCatchUp } from "@/store/slice/messageResyncSlice"
import { useMessageCatchUp } from "./useMessageCatchUp"

// A conversation reads what came after its newest message once a
// connection's subscriptions are answered: a message sent between its first
// read and that answer was in neither (FLUIDITY-LEAD-8's rtGap, 22 Oct 2026).

afterEach(cleanup)

function Conversation({ readNewer, ready }: { readNewer: () => void; ready: boolean }) {
  useMessageCatchUp(readNewer, ready)
  return null
}

const mount = (readNewer: () => void, ready: boolean) =>
  render(
    <Provider store={store}>
      <Conversation readNewer={readNewer} ready={ready} />
    </Provider>,
  )

const answered = () => act(() => void store.dispatch(triggerMessageCatchUp()))

describe("a conversation's catch-up", () => {
  it("reads what came after its newest message once a connection's subscriptions are answered", () => {
    const readNewer = vi.fn()
    mount(readNewer, true)
    expect(readNewer, "nothing on opening").not.toHaveBeenCalled()
    answered()
    expect(readNewer).toHaveBeenCalledTimes(1)
  })

  it("waits for its own first read when the answer comes first, then reads once", () => {
    const readNewer = vi.fn()
    const view = mount(readNewer, false)
    answered()
    expect(readNewer, "its first read isn't in yet").not.toHaveBeenCalled()
    view.rerender(
      <Provider store={store}>
        <Conversation readNewer={readNewer} ready={true} />
      </Provider>,
    )
    expect(readNewer).toHaveBeenCalledTimes(1)
    view.rerender(
      <Provider store={store}>
        <Conversation readNewer={readNewer} ready={true} />
      </Provider>,
    )
    expect(readNewer, "once").toHaveBeenCalledTimes(1)
  })

  it("leaves alone an answer from before it opened: it read after that", () => {
    answered()
    const readNewer = vi.fn()
    mount(readNewer, true)
    expect(readNewer).not.toHaveBeenCalled()
  })

  it("reads again on the next connection's answer", () => {
    const readNewer = vi.fn()
    mount(readNewer, true)
    answered()
    answered()
    expect(readNewer).toHaveBeenCalledTimes(2)
  })

  it("reads with the latest reader: the newest message it knows at the answer", () => {
    const first = vi.fn()
    const latest = vi.fn()
    const view = mount(first, true)
    view.rerender(
      <Provider store={store}>
        <Conversation readNewer={latest} ready={true} />
      </Provider>,
    )
    answered()
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
  })
})
