// messageDomId returns the stable DOM id used to anchor a message element so a
// reply preview can jump to its parent. Kept in one place so the setter (the
// message card) and the jumper (the reply preview click) never drift.
export function messageDomId(uuid?: string): string {
  return uuid ? `msg-${uuid}` : ""
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

  // Transient highlight so the eye lands on the right message. The classes are
  // removed after the pulse so repeated jumps re-trigger cleanly.
  const HIGHLIGHT = ["bg-primary/10", "transition-colors", "duration-700"]
  el.classList.add(...HIGHLIGHT)
  window.setTimeout(() => {
    el.classList.remove("bg-primary/10")
  }, 1200)
  window.setTimeout(() => {
    el.classList.remove("transition-colors", "duration-700")
  }, 2000)
}
