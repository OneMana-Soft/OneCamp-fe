"use client"

import { useLayoutEffect } from "react"

/** The attribute on <html> while the signed-in app is drawn (app/globals.css locks the page by it). */
export const APP_SHELL_ATTR = "data-app-shell"

/**
 * Marks <html> while the signed-in app is drawn: the app scrolls inside its
 * own panes, so the document itself must never move (on iOS it would
 * rubber-band the whole shell), and a public page must scroll. It was
 * html:has([data-app-shell]) on a marker span, and a :has() on the root is
 * matched again whenever anything is added to or taken from the document.
 * Before the paint, as the span was: the server sends no markup for an app
 * page, so the span came with the app's first draw too.
 */
export function AppShellMark() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute(APP_SHELL_ATTR, "")
    return () => root.removeAttribute(APP_SHELL_ATTR)
  }, [])
  return null
}
