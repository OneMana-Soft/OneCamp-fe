/**
 * Where the last press landed, for a card that opens from wherever it was
 * asked for (hub.md P1: the profile card is anchored to the avatar or name
 * that opened it, not a modal in the middle of the screen).
 *
 * The profile card is opened through the UI store by a dozen callers that
 * pass only a person's id. Rather than thread an element through each of
 * them, the app records the element under the last pointer press or key press
 * (installed once, from the always-mounted UI manager), and the card anchors
 * to its box when it opens.
 */
let lastEl: Element | null = null
let installed = false

export function installAnchorTracking(doc: Document = document): () => void {
  if (installed) return () => {}
  installed = true
  const onPointer = (e: Event) => {
    lastEl = e.target instanceof Element ? e.target : null
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") lastEl = doc.activeElement
  }
  doc.addEventListener("pointerdown", onPointer, true)
  doc.addEventListener("keydown", onKey, true)
  return () => {
    installed = false
    doc.removeEventListener("pointerdown", onPointer, true)
    doc.removeEventListener("keydown", onKey, true)
  }
}

/** The box of the element last pressed, while it is still on the page. */
export function lastAnchorRect(): DOMRect | null {
  if (!lastEl || !lastEl.isConnected) return null
  // An avatar or a name, not the whole row it sits in: the nearest small thing.
  const el = (lastEl.closest("[data-profile-anchor],button,a,[role=button]") as Element | null) ?? lastEl
  const r = el.getBoundingClientRect()
  return r.width === 0 && r.height === 0 ? null : r
}

/** Test seam. */
export function setLastAnchor(el: Element | null): void {
  lastEl = el
}
