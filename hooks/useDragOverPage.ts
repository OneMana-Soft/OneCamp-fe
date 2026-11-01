import * as React from "react"

/**
 * Whether something is being dragged over this page: a task from a panel, a
 * file from the desktop, a link from another tab.
 *
 * A layer drawn over a drop target reads it to step aside, so that what is
 * let go on the layer lands on the target under it. The board's empty card is
 * one: it sits in the middle of an empty board, where a first drop lands, and
 * it is no part of the board's own drop target.
 *
 * A drag is followed by the elements it has entered and not yet left
 * (dragenter and dragleave come in pairs, element by element), so it is over
 * once it leaves the window or is cancelled; a drop or a dragend ends it at
 * once. An element taken off the page mid-drag never sends its dragleave up
 * to the window, so elements no longer on the page are let go as well, and a
 * drag that has gone never reads as still here. The listeners sit on the
 * window in the capture phase, ahead of any handler that stops a drag event.
 */
export function useDragOverPage(): boolean {
  const [dragging, setDragging] = React.useState(false)
  React.useEffect(() => {
    const entered = new Set<EventTarget>()
    // dragstart too: a drag from this page is on from its first move.
    const enter = (e: Event) => {
      if (e.target) entered.add(e.target)
      setDragging(true)
    }
    const leave = (e: Event) => {
      if (e.target) entered.delete(e.target)
      for (const t of entered) if (t instanceof Node && !t.isConnected) entered.delete(t)
      if (entered.size === 0) setDragging(false)
    }
    const end = () => {
      entered.clear()
      setDragging(false)
    }
    const listeners: [string, (e: Event) => void][] = [
      ["dragstart", enter],
      ["dragenter", enter],
      ["dragleave", leave],
      ["drop", end],
      ["dragend", end],
    ]
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true)
    return () => {
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, true)
    }
  }, [])
  return dragging
}
