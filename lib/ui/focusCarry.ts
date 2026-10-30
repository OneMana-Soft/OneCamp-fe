/** F7: a node that takes the place of one of its aria-label in the same commit takes the focus the old one held. */
export function focusCarry() {
  let held = ""
  return (el: HTMLElement | null) => {
    const name = el?.getAttribute("aria-label")
    if (!el || !name) return
    if (held === name) {
      held = ""
      if (document.activeElement === document.body) el.focus()
    }
    return () => {
      if (document.activeElement !== el) return
      held = name
      queueMicrotask(() => (held = ""))
    }
  }
}
