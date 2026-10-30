/**
 * Opening ⌘K from anywhere, and knowing when it is open.
 *
 * The palette mounts lazily (CommandPaletteLoader), so nothing can hold a ref
 * to it. Openers dispatch a window event instead: the sidebar's "Search or
 * ask" pill, the 404 page's Search button (with the path as the query), the
 * phone's search icon. The palette announces its own open state the same way,
 * so the pill can stay pressed while the palette it opened is up (design v3,
 * shell S4: "the eye sees where it came from").
 *
 * Edition-neutral: "ask" is only honoured where AI is on; the palette falls
 * back to search otherwise.
 */

export type PaletteMode = "search" | "ask"

export interface OpenPaletteRequest {
  /** Which segment opens. Search by default. */
  mode?: PaletteMode
  /** Text to start with, e.g. the last segment of a broken link. */
  query?: string
}

export const PALETTE_OPEN_EVENT = "onecamp:palette-open"
export const PALETTE_STATE_EVENT = "onecamp:palette-state"

// A request sent before the lazy palette has mounted is kept here and taken
// by the palette when it arrives, so the first click on the pill is never lost.
let pending: OpenPaletteRequest | null = null

/** Asks the palette to open. */
export function openPalette(request: OpenPaletteRequest = {}): void {
  pending = request
  try {
    window.dispatchEvent(new CustomEvent<OpenPaletteRequest>(PALETTE_OPEN_EVENT, { detail: request }))
  } catch {
    /* no window (tests, SSR) */
  }
}

/** For the palette: the request made before it mounted, once. */
export function takePendingPaletteRequest(): OpenPaletteRequest | null {
  const p = pending
  pending = null
  return p
}

/** For the palette: listen for open requests. Returns how to stop. */
export function onPaletteOpenRequest(cb: (request: OpenPaletteRequest) => void): () => void {
  const handler = (e: Event) => {
    pending = null
    cb((e as CustomEvent<OpenPaletteRequest>).detail ?? {})
  }
  window.addEventListener(PALETTE_OPEN_EVENT, handler)
  return () => window.removeEventListener(PALETTE_OPEN_EVENT, handler)
}

/**
 * For the palette's loader (components/ui/CommandPaletteLoader): hear that the
 * palette is wanted, leaving the request for the palette to take as it mounts.
 * onPaletteOpenRequest takes it, which would mount a palette that stays shut.
 */
export function onPaletteWanted(cb: () => void): () => void {
  const handler = () => cb()
  window.addEventListener(PALETTE_OPEN_EVENT, handler)
  return () => window.removeEventListener(PALETTE_OPEN_EVENT, handler)
}

/** For the palette: say whether it is open now. */
export function announcePaletteState(open: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent<{ open: boolean }>(PALETTE_STATE_EVENT, { detail: { open } }))
  } catch {
    /* no window */
  }
}

/** For an opener: follow whether the palette is open. Returns how to stop. */
export function onPaletteState(cb: (open: boolean) => void): () => void {
  const handler = (e: Event) => cb(!!(e as CustomEvent<{ open: boolean }>).detail?.open)
  window.addEventListener(PALETTE_STATE_EVENT, handler)
  return () => window.removeEventListener(PALETTE_STATE_EVENT, handler)
}
