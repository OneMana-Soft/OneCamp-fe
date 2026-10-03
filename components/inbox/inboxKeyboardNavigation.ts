export type InboxKeyboardAction = "next" | "previous" | "open"

export function getInboxKeyboardAction(key: string): InboxKeyboardAction | null {
  switch (key.toLowerCase()) {
    case "j":
      return "next"
    case "k":
      return "previous"
    case "enter":
    case "o":
      return "open"
    default:
      return null
  }
}

export function getNextInboxSelectionIndex(
  currentIndex: number,
  direction: "next" | "previous",
  itemCount: number,
): number {
  if (itemCount <= 0) return -1

  const lastIndex = itemCount - 1
  const current = Math.min(Math.max(currentIndex, 0), lastIndex)
  const delta = direction === "next" ? 1 : -1

  return Math.min(Math.max(current + delta, 0), lastIndex)
}

export function shouldHandleInboxShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) {
    return false
  }

  const control = target.closest("button, a, [role='button']")
  return !control || control.hasAttribute("data-inbox-thread")
}
