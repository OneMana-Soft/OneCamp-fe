import * as React from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { focusHandOff } from "./focusHandOff"
import { watchInputModality } from "./inputModality"

// V-426: at a sheet's width, Escape on a doc row's sheet, opened over the
// Pages sheet, sometimes left the focus on the Pages sheet's own box instead
// of its row. As the row's sheet goes, the focus falls to <body>; the trap of
// the sheet behind (Radix FocusScope's MutationObserver, which doesn't check
// that it's paused) then puts it on its own box when anything inside it is
// removed, a task before the row's sheet hands it off (onCloseAutoFocus).

const key = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
const aTaskLater = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

/** The Pages sheet, its tree's row, and the row's own sheet over it. */
function Sheets({ rowSheet, mark }: { rowSheet: boolean; mark: boolean }) {
  const [handOff] = React.useState(() => focusHandOff(() => document.getElementById("handbook")))
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined}>
          <Dialog.Title>Pages</Dialog.Title>
          <div role="tree" aria-label="Workspace pages">
            <div role="treeitem" id="handbook" tabIndex={-1} aria-selected={false}>
              Handbook
              {/* What the close takes out of the sheet behind (a row's "⋯" or mark). */}
              {mark ? <span data-mark="">⋯</span> : null}
            </div>
          </div>
          <Dialog.Root open={rowSheet}>
            <Dialog.Portal>
              <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={handOff.onCloseAutoFocus}>
                <Dialog.Title>Handbook</Dialog.Title>
                <button type="button">Rename</button>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

describe("a row's sheet over the sheet that holds its row, closed from the keys", () => {
  watchInputModality()
  afterEach(cleanup)

  for (const removed of [false, true]) {
    it(`gives the focus back to its row${removed ? ", when the close takes something out of the sheet behind" : ""}`, async () => {
      const { rerender } = render(<Sheets rowSheet mark />)
      await aTaskLater()
      expect(document.activeElement?.textContent).toBe("Rename")
      key()
      rerender(<Sheets rowSheet={false} mark={!removed} />)
      await aTaskLater()
      await aTaskLater()
      expect(document.activeElement?.id).toBe("handbook")
    })
  }
})
