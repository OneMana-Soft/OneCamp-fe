// messageDomId returns the stable DOM id used to anchor a message element so a
// reply preview can jump to its parent. Kept in one place so the setter (the
// message card) and the jumper (the reply preview click) never drift.
export function messageDomId(uuid?: string): string {
  return uuid ? `msg-${uuid}` : ""
}

// How long a message stays lit once jumped to, and how long it fades out.
const LIT_MS = 1200
const FADE_MS = 800

/**
 * Lights a message up a moment, so the eye lands on it: one jumped to from a
 * reply preview, or opened from a link (chat A1, "in place, highlighted").
 * The classes go once it has faded, so another jump lights it again. A no-op
 * when the message isn't drawn. SSR-safe.
 */
export function highlightMessage(uuid?: string): void {
  if (!uuid || typeof document === "undefined") return
  const el = document.getElementById(messageDomId(uuid))
  if (!el) return
  el.classList.add("bg-primary/10", "transition-colors", "duration-700")
  el.dataset.highlighted = ""
  window.setTimeout(() => el.classList.remove("bg-primary/10"), LIT_MS)
  window.setTimeout(() => {
    el.classList.remove("transition-colors", "duration-700")
    delete el.dataset.highlighted
  }, LIT_MS + FADE_MS)
}

// scrollToMessage scrolls the parent message into view and briefly highlights
// it, when that message is currently rendered in the DOM. It degrades
// gracefully: if the parent isn't loaded (e.g. older than the loaded window),
// it's a no-op rather than an error. SSR-safe (guards document).
export function scrollToMessage(uuid?: string): void {
  if (!uuid || typeof document === "undefined") return
  const el = document.getElementById(messageDomId(uuid))
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  highlightMessage(uuid)
}
