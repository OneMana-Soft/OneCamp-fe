import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/core'

// A slot draws once, whatever its host does. Every doc surface draws its
// slots through SlotOutlet, and a doc open drew its host (DocView) 15 times:
// each time every outlet, every contribution and everything inside them drew
// again, 417 of the open's 2,352 renders in the wrappers alone (scripts/fluidity
// --names treeDocOpen, 7 Nov). An outlet draws again only when what it is given
// changes, or when something registers later.

// Each SlotOutlet draw reads its slot's contributions once: that is its draw count.
vi.mock('./registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./registry')>()
  return { ...actual, slotFor: vi.fn(actual.slotFor) }
})

import { registerSlot, slotFor } from './registry'
import { SlotOutlet } from './slots'
import type { SlotProps } from './types'

afterEach(cleanup)

const draws: Record<string, number> = {}
const seen: Record<string, SlotProps> = {}
function counted(name: string) {
  return function Counted(props: SlotProps) {
    draws[name] = (draws[name] ?? 0) + 1
    seen[name] = props
    return <span data-testid={`slot-${name}`}>{props.docId}</span>
  }
}
for (const [name, order] of [['a', 0], ['b', 1]] as const) {
  registerSlot({ slot: 'session', id: `test.draws.${name}`, edition: 'both', order, load: async () => ({ default: counted(name) }) })
}

const GATE = { ai: false }
const outletDraws = () => vi.mocked(slotFor).mock.calls.filter(([slot]) => slot === 'session').length

/** A host that redraws on demand, as DocView does while a doc opens. */
function host(docId = 'd1', editor: Editor | null = null) {
  let redraw = () => {}
  let give = (_: { docId: string; editor: Editor | null }) => {}
  function Host() {
    const [, setN] = React.useState(0)
    const [props, setProps] = React.useState({ docId, editor })
    redraw = () => setN((n) => n + 1)
    give = setProps
    return <SlotOutlet slot="session" gate={GATE} docId={props.docId} editor={props.editor} />
  }
  render(<Host />)
  return { redraw: () => act(() => redraw()), give: (p: { docId: string; editor: Editor | null }) => act(() => give(p)) }
}

describe('a slot outlet draws once', () => {
  it("doesn't draw again, nor its contributions, when its host redraws", async () => {
    const h = host()
    await screen.findByTestId('slot-a')
    await screen.findByTestId('slot-b')
    const outlet = outletDraws()
    const a = draws.a
    const b = draws.b
    for (let i = 0; i < 10; i++) await h.redraw()
    expect(outletDraws() - outlet).toBe(0)
    expect(draws.a - a).toBe(0)
    expect(draws.b - b).toBe(0)
  })

  it('draws its contributions again when the doc or the editor changes', async () => {
    const h = host('d1')
    expect((await screen.findByTestId('slot-a')).textContent).toBe('d1')
    const a = draws.a
    await h.give({ docId: 'd2', editor: null })
    expect(screen.getByTestId('slot-a').textContent).toBe('d2')
    expect(draws.a - a).toBe(1)
    const editor = {} as Editor
    await h.give({ docId: 'd2', editor })
    expect(seen.a.editor).toBe(editor)
    expect(draws.a - a).toBe(2)
  })

  it('still draws a contribution that registers after it, and only that one', async () => {
    host()
    await screen.findByTestId('slot-a')
    await screen.findByTestId('slot-b')
    expect(screen.queryByTestId('slot-late')).toBeNull()
    const a = draws.a
    const b = draws.b
    await act(async () => {
      registerSlot({ slot: 'session', id: 'test.draws.late', edition: 'both', order: 2, load: async () => ({ default: counted('late') }) })
    })
    expect((await screen.findByTestId('slot-late')).textContent).toBe('d1')
    // The outlet draws again for the new registration with the same props: the contributions already there don't.
    expect(draws.a - a).toBe(0)
    expect(draws.b - b).toBe(0)
  })
})
