import { afterEach, describe, expect, it } from "vitest"
import { createRef, useCallback } from "react"
import { act, cleanup, render } from "@testing-library/react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"
import { MessageListVirtua } from "./MessaageListVirtua"

// A message row re-draws only when what it draws changes. Its memo compared
// the row's index and the list's length, so a new message (length) re-drew
// every row on screen and older ones loading (every index) did too: about
// 150 components a row in a channel. What the rows take from their place is
// whether they are among the newest few, so that is all that's compared.

afterEach(cleanup)

type Msg = { id: string; text: string }
const item = (n: number): FlatItem<Msg> => ({ type: "item", key: `m${n}`, data: { id: `m${n}`, text: `message ${n}` } })

function List({ items, drawn }: { items: FlatItem<Msg>[]; drawn: Map<string, number> }) {
  const renderItem = useCallback(
    (m: Msg, index: number, total: number) => {
      drawn.set(m.id, (drawn.get(m.id) ?? 0) + 1)
      return <div data-newest={index >= total - 5 ? "" : undefined}>{m.text}</div>
    },
    [drawn],
  )
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

describe("a message list's rows", () => {
  it("re-draw only the newest few when a message arrives", () => {
    const drawn = new Map<string, number>()
    const first = Array.from({ length: 20 }, (_, i) => item(i))
    const view = render(<List items={first} drawn={drawn} />)
    const mounted = [...drawn.keys()]
    expect(mounted.length).toBeGreaterThan(6)
    drawn.clear()
    act(() => view.rerender(<List items={[...first, item(20)]} drawn={drawn} />))
    const redrawn = mounted.filter((k) => drawn.has(k))
    expect(redrawn.length).toBeLessThanOrEqual(6)
  })

  it("re-draw none of the old rows when older messages load above", () => {
    const drawn = new Map<string, number>()
    const recent = Array.from({ length: 20 }, (_, i) => item(i + 100))
    const view = render(<List items={recent} drawn={drawn} />)
    const mounted = [...drawn.keys()]
    drawn.clear()
    const older = Array.from({ length: 10 }, (_, i) => item(i))
    act(() => view.rerender(<List items={[...older, ...recent]} drawn={drawn} />))
    expect(mounted.filter((k) => drawn.has(k))).toEqual([])
  })
})
