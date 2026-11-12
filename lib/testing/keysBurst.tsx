import { renders } from "@/lib/testing/reactRenders"
import * as React from "react"
import { fireEvent } from "@testing-library/react"
import { expect } from "vitest"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { ListSelectionContext } from "@/hooks/useListSelection"
import type { SelectionStore } from "@/lib/listSelection"

/**
 * The J key path on every surface the keys go (FLUIDITY-24): the keys' place
 * is painted (hooks/useListKeyboard), so a burst of J draws no row and lights
 * one, the store's highlight. One check for the project list, the table, the
 * backlog and the board. `rows`: the names the surface's row components draw
 * as (lib/testing/reactRenders, which the test file imports first).
 */
export function expectJBurstDrawsNoRow({ container, store, rows, presses = 5 }: { container: Element; store: () => SelectionStore | null; rows: string[]; presses?: number }) {
  const from = store()?.get().highlighted ?? null
  renders.reset()
  for (let i = 0; i < presses; i++) fireEvent.keyDown(document.activeElement ?? document.body, { key: "j" })
  const drawn = Object.fromEntries(rows.map((name) => [name, renders.of(name)]))
  const highlighted = store()?.get().highlighted ?? null
  const lit = Array.from(container.querySelectorAll<HTMLElement>("[data-task-id][data-highlighted]"), (el) => el.dataset.taskId)
  expect(highlighted, "J moved the highlight").not.toBe(from)
  expect(drawn, `rows drawn by ${presses} J (most drawn: ${renders.top(6)})`).toEqual(Object.fromEntries(rows.map((name) => [name, 0])))
  expect(lit, "one row lit, the store's").toEqual([highlighted])
}

/** Hands a test the selection store of the list it is drawn in (KeyboardList's own). */
export function SelectionProbe({ into }: { into: { store: SelectionStore | null } }) {
  into.store = React.useContext(ListSelectionContext)
  return null
}

/** The keys over a surface, as KeyboardList puts them (hooks/useListKeyboard), on the store given. */
export function KeysOver({ store, children }: { store: SelectionStore; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useListKeyboard({ containerRef: ref, store, enabled: true })
  return (
    <ListSelectionContext.Provider value={store}>
      <div ref={ref}>{children}</div>
    </ListSelectionContext.Provider>
  )
}
