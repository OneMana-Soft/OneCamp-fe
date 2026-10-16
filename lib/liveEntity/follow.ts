/** A click as a link reads it: whether ⌘, Ctrl or the middle button asked for a new tab. */
export type LinkClick = { metaKey?: boolean; ctrlKey?: boolean; button?: number }

/** Whether a click asks for a new tab. */
export const wantsNewTab = (e: LinkClick) => !!(e.metaKey || e.ctrlKey || e.button === 1)

/** Opens a link the way a link opens: in a new tab with ⌘, Ctrl or the middle button, else here. */
export function followHref(href: string, e: LinkClick, push: (href: string) => void) {
  if (wantsNewTab(e)) window.open(href, "_blank", "noopener")
  else push(href)
}

/** Only the middle button's auxclick opens (a right click's auxclick is the context menu's). */
export const onMiddleClick = <E extends { button: number }>(open: (e: E) => void) => (e: E) => {
  if (e.button === 1) open(e)
}
