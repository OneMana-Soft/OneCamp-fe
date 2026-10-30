import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Drawer, DrawerContent, DrawerTitle } from "./drawer"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

// A tap on a sheet's scrim closes the sheet and does nothing else. React
// carries an event up the tree the portal came from, not the page's, so the
// scrim of a sheet opened from inside a row (a tree row's "⋯" on a phone) gave
// its tap to the row too, and the row opened its page as the sheet closed
// (e2e/docs/docsHome.spec.ts's phone leg, 27 Oct 2026). Stopped at the scrim,
// the tap no longer reached the document either, where Radix closes a sheet on
// a finger's tap outside, so on a phone the sheet stayed open (web batch wJ26).

installPointerEvent()
afterEach(cleanup)

function RowWithSheet({ onRow }: { onRow: () => void }) {
  const [open, setOpen] = React.useState(true)
  return (
    <div role="treeitem" aria-selected={false} onClick={onRow}>
      Handbook
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent aria-describedby={undefined} header={<DrawerTitle>Handbook</DrawerTitle>}>
          <p>Rename</p>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

/** The sheet, up, with Radix listening for a press outside it: it starts to a task after the sheet opens. */
async function sheetUp() {
  const sheet = await screen.findByRole("dialog", { name: "Handbook" })
  await act(() => new Promise<void>((done) => setTimeout(done, 0)))
  return sheet
}

const FINGER = { button: 0, pointerType: "touch", pointerId: 7, isPrimary: true }

/** A finger's tap on the scrim, as a phone's browser sends it: down, up, then the click. */
function tapTheScrim() {
  const scrim = document.querySelector<HTMLElement>("[data-v3-scrim]")
  expect(scrim).not.toBeNull()
  fireEvent.pointerDown(scrim!, FINGER)
  fireEvent.pointerUp(scrim!, FINGER)
  fireEvent.click(scrim!, { detail: 1 })
}

describe("a finger's tap on a sheet's scrim", () => {
  it("closes the sheet", async () => {
    render(<RowWithSheet onRow={() => {}} />)
    const sheet = await sheetUp()
    tapTheScrim()
    // Closed as the tap ends; its close animation then takes it off the page.
    await waitFor(() => expect(sheet).toHaveAttribute("data-state", "closed"))
  })

  it("reaches nothing the sheet was opened from", async () => {
    const onRow = vi.fn()
    render(<RowWithSheet onRow={onRow} />)
    await sheetUp()
    tapTheScrim()
    expect(onRow).not.toHaveBeenCalled()
  })

  it("leaves a tap in the row itself to the row", () => {
    const onRow = vi.fn()
    render(<RowWithSheet onRow={onRow} />)
    fireEvent.click(screen.getByText("Handbook", { selector: "[role=treeitem]" }))
    expect(onRow).toHaveBeenCalledTimes(1)
  })
})
