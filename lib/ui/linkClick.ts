/**
 * Whether a click on a link is the app's to handle: the main button with no
 * modifier. A middle click, or one with Ctrl, ⌘, Shift or Alt, is the
 * browser's (a new tab or window, a download), so a link whose plain click
 * the app handles itself leaves those alone. Pure.
 */
export function isPlainLeftClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
