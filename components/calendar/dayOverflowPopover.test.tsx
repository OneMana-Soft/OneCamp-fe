import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import { DayOverflowPopover } from "./dayOverflowPopover"

pinTestClock()
afterEach(cleanup)

const day = new Date(2026, 9, 15) // Thu 15 Oct

/** A busy day's cell: the shared "+N more" over two rows, each reporting what its action was given. */
function busyDay(props: Partial<Parameters<typeof DayOverflowPopover>[0]> = {}) {
  const drawn = vi.fn()
  const onRow = vi.fn()
  const onCellPress = vi.fn()
  render(
    <div data-cell="" onPointerDown={onCellPress}>
      <DayOverflowPopover day={day} hidden={2} {...props}>
        {(done) => {
          drawn()
          return ["Standup", "Review"].map((title) => (
            <button key={title} type="button" onClick={() => onRow(title, done())}>
              {title}
            </button>
          ))
        }}
      </DayOverflowPopover>
    </div>,
  )
  return { drawn, onRow, onCellPress, cell: document.querySelector("[data-cell]") as HTMLElement }
}

describe("a day's +N more (C06), shared by the calendar's month and a table's calendar", () => {
  it("says how many more, and lists them all under the day's name only once opened", () => {
    const { drawn } = busyDay()
    expect(screen.queryByText("Standup")).toBeNull()
    expect(drawn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }))
    expect(screen.getByText("Thu 15 Oct").className).not.toMatch(/text-brand-text/)
    expect(screen.getByRole("button", { name: "Standup" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy()
  })

  it("names today's day in brand", () => {
    busyDay({ today: true })
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }))
    expect(screen.getByText("Thu 15 Oct").className).toMatch(/text-brand-text/)
  })

  it("closes for a row's action and hands it the button, still on screen, to open beside", () => {
    const { onRow } = busyDay()
    const more = screen.getByRole("button", { name: "+2 more" })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole("button", { name: "Review" }))
    expect(onRow).toHaveBeenCalledWith("Review", more)
    expect(screen.queryByText("Thu 15 Oct")).toBeNull()
  })

  it("adds on the day from its foot, given the day's cell", () => {
    const onAdd = vi.fn()
    const { cell } = busyDay({ add: { label: "New event", onAdd } })
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }))
    fireEvent.click(screen.getByRole("button", { name: "New event" }))
    expect(onAdd).toHaveBeenCalledWith(cell)
    expect(screen.queryByText("Thu 15 Oct")).toBeNull()
  })

  it("says +2 where the cell is narrow, and 2 more to a screen reader", () => {
    busyDay({ compact: true })
    expect(screen.getByRole("button", { name: "2 more" }).textContent).toBe("+2")
  })

  it("keeps a press on it from its cell, where a drag across days starts", () => {
    const { onCellPress } = busyDay()
    fireEvent.pointerDown(screen.getByRole("button", { name: "+2 more" }))
    expect(onCellPress).not.toHaveBeenCalled()
  })
})
