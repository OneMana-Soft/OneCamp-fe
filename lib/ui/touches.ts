type Touch = (e: TouchEvent) => void

/** A finger on `el`; the move (and the start if `held`) may preventDefault. */
export function listenTouches(el: EventTarget, t: { start?: Touch; move?: Touch; end?: Touch }, held = false) {
  const on = [
    ["touchstart", t.start, !held],
    ["touchmove", t.move, false],
    ["touchend", t.end, true],
    ["touchcancel", t.end, true],
  ] as const
  for (const [type, fn, passive] of on) if (fn) el.addEventListener(type, fn as EventListener, { passive })
  return () => {
    for (const [type, fn] of on) if (fn) el.removeEventListener(type, fn as EventListener)
  }
}
