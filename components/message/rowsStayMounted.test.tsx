import { afterEach, describe, expect, it } from "vitest"
import { createRef, useCallback, useEffect } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"
import { MessageListVirtua } from "./MessageListVirtua"

// Every message stays mounted while the list scrolls. The list asked its
// virtualiser for 500 rows of overscan, but the virtualiser applies overscan
// only ahead of a scroll: scrolling down took every row above the screen out,
// and scrolling up every row below it, and when the scroll stopped they all
// came back, mounted afresh. Opening a thread from the bottom of a channel read
// back by six pages remounted 341 rows (8,383 components: fluid-04, 20 Oct),
// and every scroll that stopped did the same.

afterEach(cleanup)

type Msg = { id: string; text: string }
const item = (n: number): FlatItem<Msg> => ({ type: "item", key: `m${n}`, data: { id: `m${n}`, text: `message ${n}` } })

function Row({ m, life }: { m: Msg; life: { mounts: number; unmounts: number } }) {
  useEffect(() => {
    life.mounts++
    return () => {
      life.unmounts++
    }
  }, [life])
  return <div>{m.text}</div>
}

function List({ items, life }: { items: FlatItem<Msg>[]; life: { mounts: number; unmounts: number } }) {
  const renderItem = useCallback((m: Msg) => <Row m={m} life={life} />, [life])
  return (
    <MessageListVirtua
      items={items}
      renderItem={renderItem}
      getDateHeading={(d) => d}
      fetchOlderMessage={() => {}}
      fetchNewMessage={() => {}}
      clickedScrollToBottom={() => {}}
      hasOldMessage={false}
      hasNewMessage={false}
      ref={createRef<VListHandle>()}
    />
  )
}

// Scrolls the list to top, as a reader's wheel does: the position, then the event.
function scrollTo(el: HTMLElement, top: number) {
  Object.defineProperty(el, "scrollTop", { configurable: true, value: top })
  act(() => void el.dispatchEvent(new Event("scroll")))
}

describe("a long conversation's rows", () => {
  it("stay mounted while the list scrolls down and up, and when it stops", async () => {
    const life = { mounts: 0, unmounts: 0 }
    const rows = Array.from({ length: 60 }, (_, i) => item(i))
    render(<List items={rows} life={life} />)
    // The virtualiser starts listening to the list's scrolls a microtask on.
    await act(async () => {})
    expect(life.mounts).toBe(60)
    const scroller = screen.getByRole("region")
    for (const top of [40, 400, 1200, 2000, 1600, 800, 0]) scrollTo(scroller, top)
    // The scroll stops (the virtualiser waits 150 ms for the next event).
    await act(() => new Promise((r) => setTimeout(r, 200)))
    expect({ mounts: life.mounts, unmounts: life.unmounts }).toEqual({ mounts: 60, unmounts: 0 })
  })
})
