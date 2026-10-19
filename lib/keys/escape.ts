import { answers } from "@/lib/keys/onEscape"
import { isComposingKey } from "@/lib/keys/ime"

/**
 * The one Escape (interaction spec, rule 7): one press, one thing, the
 * innermost first. Code answers it with onEscape (lib/keys/onEscape), in a layer;
 * nothing else listens for it on the window or the document
 * (escapeGuard.test.ts). The root providers start it, once for every page.
 *
 *   (first of all, in the window: an input method's Escape is nobody else's, and one
 *   from what answers it itself, data-escape-own, is left to it, in every layer at once)
 *   drag     a drag in progress: heard first (window, capturing), and stopped there
 *   (Radix's menus, popovers, dialogs and sheets, and an editor's popups, take theirs in the document)
 *   overlay  drawn over the page: a zoomed image, the rail's peek, a doc's focus mode, a toast with focus
 *   panel    beside the page: the right panel, a guest's task, a table's record
 *   page     the page's own state: an inbox thread, a list's selection, Settings, following someone
 *   toast    the front toast, last
 *
 * After the drag, a press is heard as it leaves the page (window, bubbling),
 * unless a layer took it or is open; the first handler that uses it marks it
 * used (defaultPrevented). Newest first in a layer.
 */
export type EscapeLayer = "drag" | "overlay" | "panel" | "page" | "toast"
/** False when the press wasn't for it; anything else, it used the press. */
export type EscapeHandler = (event: KeyboardEvent) => boolean | void

/**
 * A press a layer marked used but passed on unused: a tooltip's (it closes,
 * and the press goes on, a tooltip being no layer of the page's) and a sheet's
 * over the page (components/ui/overlaySheet: Radix leaves it open, and the
 * press goes on to the panel). They set it themselves, without this module.
 */
export type HandedOn = { escapeHandedOn?: boolean }

/**
 * A press left to what answers Escape itself (data-escape-own): marked used
 * before the document, so a Radix layer round it stays and the page's layers
 * take no part, but left for its owner (lib/keys/escapeOwn: escapeTaken).
 */
export type LeftToOwner = { escapeLeftToOwner?: boolean }

/**
 * Whether a press belongs to a layer over the page: one took it (a Radix
 * layer, or an editor's suggestion popup), or one is open (a dialog, a menu,
 * a list, a popover; a tooltip doesn't count). A sheet that leaves Escape to
 * its content, or a surface that answers it here (data-escape-own: a zoomed
 * image, the rail's peek), is no layer over itself.
 */
export function escapeBelongsToLayer(event: Event & HandedOn, doc: Document = document): boolean {
  if (event.defaultPrevented && !event.escapeHandedOn) return true
  if (doc.querySelector('[role="dialog"]:not([data-overlay-sheet="own-escape"]):not([data-escape-own]), [role="alertdialog"], [role="menu"], [role="listbox"], .tippy-box[data-state="visible"]')) return true
  return Array.from(doc.querySelectorAll("[data-radix-popper-content-wrapper]")).some((layer) => !layer.querySelector('[role="tooltip"]'))
}

/**
 * Whether a press is its own for what answers Escape itself (data-escape-own:
 * a rename that puts its name back, a search that clears, a run that stops):
 * it had the press first, in its own handler, and nothing over the page or on
 * it hears it as well. A dialog of the app's own marked so (a zoomed image,
 * the rail's peek, a table's record) answers it here instead, in its layer.
 * escapeGuard.test.ts holds every key handler that reads Escape to the mark.
 */
function ownedByWhatAnswersIt(event: Event): boolean {
  const owner = (event.target as Element | null)?.closest?.("[data-escape-own]")
  return !!owner && owner.getAttribute("role") !== "dialog"
}

/** Escape, and not an input method's (mid-word, or Safari's press after the word: isComposingKey). */
const isEscape = (event: KeyboardEvent) => event.key === "Escape" && !isComposingKey(event)
/** Whether a handler in `layer`, the newest first, used the press. */
const usedIn = (layer: EscapeLayer, event: KeyboardEvent) => answers[layer].slice().reverse().some((answer) => answer(event) !== false)

/** Starts the one Escape on this window; returns the function that stops it. */
export function listenForEscape(): () => void {
  // Before the document, where every Radix layer hears Escape and closes on a
  // press nobody used: an input method's Escape drops the word being made, and
  // is nobody else's; one from what answers Escape itself is left to it, used,
  // so the layer round it stays for the next press. Every layer at once, from
  // here, so no layer carries a line of its own for it.
  const first = (event: KeyboardEvent & LeftToOwner) => {
    if (event.key !== "Escape") return
    if (isComposingKey(event)) {
      event.stopPropagation()
      return
    }
    if (!ownedByWhatAnswersIt(event)) return
    event.escapeLeftToOwner = true
    event.preventDefault()
  }
  const drag = (event: KeyboardEvent) => {
    if (!isEscape(event) || !usedIn("drag", event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const rest = (event: KeyboardEvent & HandedOn) => {
    if (!isEscape(event) || escapeBelongsToLayer(event) || ownedByWhatAnswersIt(event)) return
    if (!(["overlay", "panel", "page", "toast"] as const).some((layer) => usedIn(layer, event))) return
    event.escapeHandedOn = false
    event.preventDefault()
  }
  window.addEventListener("keydown", first, true)
  window.addEventListener("keydown", drag, true)
  window.addEventListener("keydown", rest)
  return () => {
    window.removeEventListener("keydown", first, true)
    window.removeEventListener("keydown", drag, true)
    window.removeEventListener("keydown", rest)
  }
}
