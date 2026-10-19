/**
 * Screens for a test: a size and a pointer, and a window.matchMedia that
 * answers the media queries the app asks of them (width, height, pointer,
 * hover, orientation, and comma lists of those), so a test can say "a phone
 * in landscape" rather than "every query matches". jsdom has no matchMedia of
 * its own.
 */
export type Screen = { width: number; height: number; coarse: boolean }

export const SCREENS = {
  "a phone in portrait": { width: 390, height: 844, coarse: true },
  "a phone in landscape": { width: 844, height: 390, coarse: true },
  "a tablet": { width: 768, height: 1024, coarse: true },
  "a computer": { width: 1280, height: 800, coarse: false },
} satisfies Record<string, Screen>

export type ScreenName = keyof typeof SCREENS

function feature(condition: string, s: Screen): boolean {
  const m = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+))?\)$/.exec(condition.trim())
  if (!m) return condition.trim() === "all" || condition.trim() === "screen"
  const [, name, raw = ""] = m
  const v = raw.trim()
  const px = parseFloat(v)
  switch (name) {
    case "max-width":
      return s.width <= px
    case "min-width":
      return s.width >= px
    case "max-height":
      return s.height <= px
    case "min-height":
      return s.height >= px
    case "pointer":
    case "any-pointer":
      return v === (s.coarse ? "coarse" : "fine")
    case "hover":
    case "any-hover":
      return v === (s.coarse ? "none" : "hover")
    case "orientation":
      return v === (s.width > s.height ? "landscape" : "portrait")
    case "prefers-reduced-motion":
      return v === "no-preference"
    default:
      return false
  }
}

/** Whether `query` matches on screen `s`. Pure. */
export function mediaMatches(query: string, s: Screen): boolean {
  return query.split(",").some((part) => part.split(/\band\b/).every((c) => feature(c, s)))
}

/** Puts the window on screen `s` (matchMedia, innerWidth, innerHeight); returns the undo. */
export function putOnScreen(s: Screen): () => void {
  const real = { matchMedia: window.matchMedia, width: window.innerWidth, height: window.innerHeight }
  window.matchMedia = ((query: string) => ({
    matches: mediaMatches(query, s),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(window, "innerWidth", { configurable: true, value: s.width })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: s.height })
  return () => {
    window.matchMedia = real.matchMedia
    Object.defineProperty(window, "innerWidth", { configurable: true, value: real.width })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: real.height })
  }
}
