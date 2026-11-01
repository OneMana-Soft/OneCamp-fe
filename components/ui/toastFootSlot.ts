import { PHONE_QUERY } from "@/context/MediaQueryContext"
import { isTypedInto } from "@/lib/ui/typedInto"

/** A phone pill's height (app/phone.css C9): the foot slot is at least this tall. */
const PILL = 44

/** What the toasts keep between them and an open sheet: its top edge, its header row, the field in use. */
const CLEAR = 8

/** How far a toast behind the front one steps (app/globals.css, the stack). */
const STEP = 10

/**
 * Whether a box meets the toasts' foot slot: from the list's foot up by its
 * tallest card, or a pill where none shows. Read before the list moves.
 */
export function meetsFootSlot(box: Pick<DOMRect, "top" | "bottom">, list: Element): boolean {
  const foot = list.getBoundingClientRect().bottom
  const cards = [...list.querySelectorAll(".toast-card")].map((c) => c.getBoundingClientRect().height)
  const top = foot - Math.max(PILL, ...cards)
  return box.bottom > top && box.top < foot
}

/**
 * Where the toasts' top goes while a sheet is open on a phone (V-111,
 * DESIGN-BUILD-43): in the dimmed gap above the sheet's top edge, CLEAR above
 * it, when a stack `tall` fits there; else over the sheet's content, CLEAR
 * under its header row (which holds its grabber, its title and whatever
 * stands beside it), and under the field in use when that is there. Never
 * over the sheet's header, its buttons or its foot. `fits` says whether a top
 * stays on the screen (app/phone.css keeps it under the safe top). Pure.
 */
export function sheetSlot(
  sheet: { edge: number; head: number },
  tall: number,
  fits: (top: number) => boolean,
  field?: Pick<DOMRect, "top" | "bottom"> | null,
): { top: number; above: boolean } {
  const above = sheet.edge - CLEAR - tall
  if (fits(above)) return { top: above, above: true }
  let top = sheet.head + CLEAR
  if (field && field.bottom > top && field.top < top + tall) top = field.bottom + CLEAR
  return { top, above: false }
}

/** The topmost open sheet: a drawer, a dialog or confirm drawn as one, or the task's sheet, by the sheet primitives' one mark. */
function openSheet(): HTMLElement | null {
  const open = document.querySelectorAll<HTMLElement>('[data-v3-sheet][data-state="open"]')
  return open[open.length - 1] ?? null
}

/** How far a transform (the sheet's rise or a drag) moves a box down: where it is at rest is that much higher. */
function shiftOf(el: Element): number {
  const m = /matrix(3d)?\(([^)]+)\)/.exec(getComputedStyle(el).transform)
  return m ? Number(m[2].split(",")[m[1] ? 13 : 5]) || 0 : 0
}

/** The sheet's top edge and the foot of its header row, at rest: the grabber, the header, the title and what stands beside it. */
function measureSheet(sheet: HTMLElement): { edge: number; head: number } {
  const shift = shiftOf(sheet)
  const edge = sheet.getBoundingClientRect().top - shift
  let head = edge
  for (const part of sheet.querySelectorAll("[data-v3-grabber], [data-sheet-header]")) head = Math.max(head, part.getBoundingClientRect().bottom - shift)
  const title = document.getElementById(sheet.getAttribute("aria-labelledby") ?? "")?.getBoundingClientRect()
  if (title && title.height > 1) {
    head = Math.max(head, title.bottom - shift)
    for (const c of sheet.querySelectorAll('button, a[href], [role="button"], input, select, textarea')) {
      const r = c.getBoundingClientRect()
      if (r.height > 0 && r.top < title.bottom && r.bottom > title.top) head = Math.max(head, r.bottom - shift)
    }
  }
  return { edge, head }
}

/** The stack's height: the front toast (a pill at least), and the edges of up to two behind it, or all of it opened. */
function stackHeight(list: HTMLElement): number {
  const tall = [...list.querySelectorAll<HTMLElement>('.toast-root[data-state="open"]')].map((t) => t.offsetHeight)
  if (!tall.length) return 0
  if (list.hasAttribute("data-expanded")) return tall.reduce((a, b) => a + b, 0) + STEP * (tall.length - 1)
  return Math.max(PILL, ...tall) + STEP * Math.min(tall.length - 1, 2)
}

/**
 * Keeps the toasts' list off an open sheet on a phone (sheetSlot): the list
 * gets data-sheet-slot and --toast-sheet-top, which app/phone.css C9 reads
 * while a sheet is open. Placed again when a toast comes, goes or changes,
 * when focus moves (a sheet takes it as it opens), when the sheet changes
 * size, ends its rise or closes, when it takes its name from a title it
 * shows (the task's, once it loads), and when the screen or the keyboard
 * moves. Returns the stop.
 */
export function keepOffTheSheet(list: HTMLElement): () => void {
  let frame = 0
  let watched: HTMLElement | null = null
  const unplace = () => {
    delete list.dataset.sheetSlot
    list.style.removeProperty("--toast-sheet-top")
  }
  const set = (top: number, above: boolean) => {
    list.dataset.sheetSlot = above ? "above" : "below"
    list.style.setProperty("--toast-sheet-top", `${Math.round(top)}px`)
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(place)
  }
  const resized = new ResizeObserver(schedule)
  const changed = new MutationObserver(schedule)
  const settled = (e: Event) => e.target === watched && schedule()
  const watch = (sheet: HTMLElement | null) => {
    if (sheet === watched) return
    resized.disconnect()
    changed.disconnect()
    watched?.removeEventListener("transitionend", settled)
    watched?.removeEventListener("animationend", settled)
    watched = sheet
    if (!sheet) return
    resized.observe(sheet)
    changed.observe(sheet, { attributes: true, attributeFilter: ["data-state", "aria-labelledby"] })
    sheet.addEventListener("transitionend", settled)
    sheet.addEventListener("animationend", settled)
  }
  function place() {
    frame = 0
    const sheet = window.matchMedia?.(PHONE_QUERY).matches ? openSheet() : null
    watch(sheet)
    const tall = sheet ? stackHeight(list) : 0
    if (!sheet || !tall) return unplace()
    const focused = document.activeElement
    const field = isTypedInto(focused) && sheet.contains(focused) ? focused.getBoundingClientRect() : null
    // A top the stack can't keep on the screen is moved down by phone.css (under the safe top): read where it lands.
    const fits = (top: number) => {
      set(top, true)
      return list.getBoundingClientRect().top <= Math.round(top) + 0.5
    }
    const { top, above } = sheetSlot(measureSheet(sheet), tall, fits, field)
    set(top, above)
  }
  const toasts = new MutationObserver(schedule)
  toasts.observe(list, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-state", "data-expanded"] })
  const vv = window.visualViewport
  document.addEventListener("focusin", schedule)
  document.addEventListener("focusout", schedule)
  window.addEventListener("resize", schedule)
  vv?.addEventListener("resize", schedule)
  vv?.addEventListener("scroll", schedule)
  schedule()
  return () => {
    cancelAnimationFrame(frame)
    toasts.disconnect()
    watch(null)
    document.removeEventListener("focusin", schedule)
    document.removeEventListener("focusout", schedule)
    window.removeEventListener("resize", schedule)
    vv?.removeEventListener("resize", schedule)
    vv?.removeEventListener("scroll", schedule)
    unplace()
  }
}

/**
 * Keeps the toasts' list off the field in use on a phone: a field the foot
 * slot meets gives the list data-slot="top", which app/phone.css C9 moves
 * under the top bar, as it does for the keyboard and a sheet. With no
 * keyboard reported (calls-7, a room form at 390) an Undo sat over the
 * Address field and its error. Returns the stop.
 */
export function keepOffTheField(list: HTMLElement): () => void {
  const place = (focused: Element | null) => {
    delete list.dataset.slot
    if (focused && window.matchMedia?.(PHONE_QUERY).matches && meetsFootSlot(focused.getBoundingClientRect(), list)) list.dataset.slot = "top"
  }
  const typed = (t: EventTarget | null) => (isTypedInto(t) ? t : null)
  const onIn = (e: FocusEvent) => place(typed(e.target))
  const onOut = (e: FocusEvent) => place(typed(e.relatedTarget))
  const onResize = () => place(typed(document.activeElement))
  document.addEventListener("focusin", onIn)
  document.addEventListener("focusout", onOut)
  window.addEventListener("resize", onResize)
  onResize()
  return () => {
    document.removeEventListener("focusin", onIn)
    document.removeEventListener("focusout", onOut)
    window.removeEventListener("resize", onResize)
    delete list.dataset.slot
  }
}

/** Both of the toasts' phone slots, the field's and the sheet's (ToastViewport loads this with the first field used or sheet opened). Returns the stop. */
export function keepOff(list: HTMLElement): () => void {
  const field = keepOffTheField(list)
  const sheet = keepOffTheSheet(list)
  return () => {
    field()
    sheet()
  }
}

/**
 * ⌥T's turn in a modal (toastTurn.tsx) comes with this chunk too: it holds
 * Radix's FocusScope, which no page's first load then carries for the toasts.
 */
export { takeTurn } from "./toastTurn"
