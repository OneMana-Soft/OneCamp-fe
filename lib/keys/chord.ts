/**
 * Key chords in Tiptap's notation ('Mod-l', 'Shift-f', '?'), read against a
 * key event and written as the keys list writes them, free of the editor
 * (the doc's registry re-exports chordMatches).
 */

/** Whether this is a Mac (or an iPhone or iPad), where Mod is ⌘. */
export function isMacLike(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/**
 * Whether a key event is this chord. A Mac's ⌥ types a symbol (⌥Y is ¥), so
 * there a key is also read by its place, which `code` names as on a US
 * keyboard: on a German Mac, ⌥ with the key labelled Z (Y's place) answers
 * ⌥Y. Browsers give no layout's letter for an ⌥ chord in a key event; only
 * Chromium's navigator.keyboard.getLayoutMap() maps places to letters, and it
 * answers asynchronously. Pure.
 */
export function chordMatches(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'> & { code?: string }, chord: string, mac: boolean): boolean {
  const parts = chord.split(/-(?!$)/)
  const key = parts.pop()!
  const want = new Set(parts)
  // Mod is ⌘ on a Mac and Ctrl elsewhere.
  const meta = mac ? want.has('Mod') || want.has('Meta') : want.has('Meta')
  const ctrl = mac ? want.has('Ctrl') : want.has('Mod') || want.has('Ctrl')
  if (e.metaKey !== meta || e.ctrlKey !== ctrl || e.altKey !== want.has('Alt')) return false
  const letter = /^[a-z]$/i.test(key)
  // A shifted symbol ("?") is a key of its own: Shift counts for letters and named keys.
  if ((letter || key.length > 1) && e.shiftKey !== want.has('Shift')) return false
  if (letter ? e.key.toLowerCase() === key.toLowerCase() : e.key === key) return true
  return mac && e.altKey && e.code?.replace(/^(Key|Digit)/, '').toLowerCase() === key.toLowerCase()
}

const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }

/**
 * A chord as the app's shortcut list writes its keys ("Ctrl/⌘" reads ⌘ on a
 * Mac): 'Mod-z' is "Ctrl/⌘ + Z", 'j' is "J", 'Alt-ArrowUp' is "Alt + ↑",
 * 'Backspace' stays. Pure.
 */
export function chordWords(chord: string): string {
  return chord
    .split(/-(?!$)/)
    .map((p) => (p === 'Mod' ? 'Ctrl/⌘' : ARROWS[p] ?? (p.length === 1 ? p.toUpperCase() : p)))
    .join(' + ')
}

/**
 * ⌘⏎ or Ctrl+⏎ sends the form it is pressed in, from any of its fields, the
 * notes included: a form's onKeyDown. Either key, on any computer, as the
 * app's other ⌘⏎ fields take it; never with Alt (split view's Ctrl+Alt+⏎) or
 * Shift. A form being sent already (its submit button disabled) isn't sent
 * twice.
 */
export function submitOnModEnter(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'preventDefault'> & { currentTarget: HTMLFormElement }): void {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
  e.preventDefault()
  if (!e.currentTarget.querySelector('button[type=submit]:disabled')) e.currentTarget.requestSubmit()
}
