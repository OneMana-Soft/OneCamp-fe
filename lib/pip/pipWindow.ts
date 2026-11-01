/**
 * Picture-in-picture, for any surface (meet-14: a call's picture-in-picture
 * from the dock): which kind this browser has, and a window dressed like the
 * app.
 */

/** "document": a window of our own (Document Picture-in-Picture); "video": a <video>'s own picture-in-picture; null: neither. */
export type PipKind = "document" | "video" | null

/** What a picture-in-picture window is asked for. */
export type PipSize = { width: number; height: number }

/** The browser's Document Picture-in-Picture, newer than TypeScript's DOM types. */
export type DocumentPip = { requestWindow(options?: PipSize): Promise<Window>; readonly window: Window | null }

/** This browser's Document Picture-in-Picture, if it has one. */
export function documentPip(w: Window | undefined = typeof window === "undefined" ? undefined : window): DocumentPip | undefined {
  return (w as unknown as { documentPictureInPicture?: DocumentPip } | undefined)?.documentPictureInPicture
}

/** Which picture-in-picture this browser has (none outside a browser). */
export function pipKind(w: Window | undefined = typeof window === "undefined" ? undefined : window): PipKind {
  if (!w) return null
  if (documentPip(w)) return "document"
  return w.document.pictureInPictureEnabled ? "video" : null
}

/** The root attributes that carry the theme (data-theme, the dark class, color-scheme). */
const THEME = ["class", "style", "data-theme"] as const

/** How long a window waits for a stylesheet it can only link before it's drawn anyway: the call matters more than its dress. */
export const LOOK_WAIT_MS = 1500

/** A `url(...)` in CSS text: its quote, then its address. */
const CSS_URL = /url\(\s*(["']?)([^"')]+?)\1\s*\)/g

/**
 * A loaded stylesheet's rules as CSS text, each address made full against the
 * sheet's own (a sheet's addresses are its own, and the window's is
 * about:blank). An address inside the document (#…) and data stay. Null where
 * the browser won't show the rules (another origin's sheet, or one not loaded).
 */
export function sheetRules(sheet: CSSStyleSheet, base: string): string | null {
  let rules: CSSRuleList | null
  try {
    rules = sheet.cssRules
  } catch {
    return null
  }
  if (!rules) return null
  const own = sheet.href ?? base
  return Array.from(rules, (rule) =>
    rule.cssText.replace(CSS_URL, (whole: string, _quote: string, address: string) => {
      if (/^(data:|#)/i.test(address)) return whole
      try {
        return `url("${new URL(address, own).href}")`
      } catch {
        return whole
      }
    }),
  ).join("\n")
}

/** A window's look: ready once it's dressed, and the stop. */
export type Look = { ready: Promise<void>; stop: () => void }

/**
 * Dresses a picture-in-picture window like the app, from its first frame: each
 * loaded stylesheet goes over as its rules, so nothing is left to load; one
 * the window can only link (another origin's, or one still loading) holds
 * `ready` until it loads or fails, or LOOK_WAIT_MS is up. Then the root's
 * theme and the body's classes (its fonts), and the theme kept in step while
 * the window is open. Draw into the window once `ready` settles.
 */
export function copyLook(from: Document, to: Document, wait = LOOK_WAIT_MS): Look {
  const linked: Promise<void>[] = []
  for (const el of Array.from(from.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))) {
    const rules = el instanceof HTMLLinkElement && el.sheet ? sheetRules(el.sheet, from.baseURI) : null
    if (el instanceof HTMLLinkElement && rules === null) {
      const link = to.createElement("link")
      link.rel = "stylesheet"
      link.href = el.href
      if (el.media) link.media = el.media
      linked.push(
        new Promise<void>((settle) => {
          link.addEventListener("load", () => settle(), { once: true })
          link.addEventListener("error", () => settle(), { once: true })
        }),
      )
      to.head.appendChild(link)
    } else {
      // A <style> as it is: its addresses are the document's, and the window's base is the app's.
      const style = to.createElement("style")
      style.textContent = rules ?? el.textContent
      if (el.media) style.media = el.media
      to.head.appendChild(style)
    }
  }
  to.body.className = from.body.className
  const theme = () => {
    for (const name of THEME) {
      const value = from.documentElement.getAttribute(name)
      if (value === null) to.documentElement.removeAttribute(name)
      else to.documentElement.setAttribute(name, value)
    }
  }
  theme()
  const watch = new MutationObserver(theme)
  watch.observe(from.documentElement, { attributes: true, attributeFilter: [...THEME] })
  let timer: ReturnType<typeof setTimeout> | undefined
  let settle = () => {}
  const ready =
    linked.length === 0
      ? Promise.resolve()
      : new Promise<void>((done) => {
          settle = done
          timer = setTimeout(done, wait)
          void Promise.all(linked).then(() => done())
        }).finally(() => clearTimeout(timer))
  return {
    ready,
    stop: () => {
      watch.disconnect()
      clearTimeout(timer)
      // A window closed while it waits: whoever waits for it hears at once.
      settle()
    },
  }
}

/** Chrome's automatic picture-in-picture, newer than TypeScript's DOM types. */
const ON_LEAVE = "enterpictureinpicture" as MediaSessionAction

/**
 * Lets the browser open picture-in-picture by itself when the person leaves
 * the tab (Chrome's automatic picture-in-picture, as Meet's does mid-call):
 * `open` runs then, and may open a window without a tap. A browser that
 * doesn't know the action says nothing. Returns the stop.
 */
export function openOnLeave(open: () => void, session: MediaSession | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaSession): () => void {
  if (!session) return () => {}
  try {
    session.setActionHandler(ON_LEAVE, open)
  } catch {
    // A browser without the action throws rather than ignoring it.
    return () => {}
  }
  return () => {
    try {
      session.setActionHandler(ON_LEAVE, null)
    } catch {
      // As above.
    }
  }
}
