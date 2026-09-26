// A short memory of keys, for collapsing repeats that arrive together.
//
// WHY. The same event can fire several times in a moment (a page of cards whose
// requests fail the same way, say) and each repeat should not be shown again.
// A plain map of key to time does that but keeps every key it ever saw for the
// life of the tab, so keys are dropped once their window has passed and the
// memory never holds more than one window's worth.

export interface RecentKeys {
  /** Whether key was already seen within the window. Records it when not. */
  seen(key: string, now?: number): boolean
  /** How many keys are remembered now. */
  readonly size: number
}

export function recentKeys(windowMs: number): RecentKeys {
  const at = new Map<string, number>()
  return {
    seen(key, now = Date.now()) {
      for (const [k, t] of at) if (now - t >= windowMs) at.delete(k)
      if (at.has(key)) return true
      at.set(key, now)
      return false
    },
    get size() {
      return at.size
    },
  }
}
