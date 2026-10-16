import type { KeyboardEvent } from "react"

/**
 * Arrow keys, Home and End move focus among a grid's buttons, row by row of
 * `columns`. The one copy for the doc's small pickers (a callout's kinds and
 * icons; the selection bar's old colour grid had another).
 */
export function moveInGrid(e: KeyboardEvent<HTMLElement>, columns: number) {
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
  let next = at
  if (e.key in step) next = Math.min(buttons.length - 1, Math.max(0, at + step[e.key]))
  else if (e.key === "Home") next = 0
  else if (e.key === "End") next = buttons.length - 1
  else return
  e.preventDefault()
  buttons[next].focus()
}
