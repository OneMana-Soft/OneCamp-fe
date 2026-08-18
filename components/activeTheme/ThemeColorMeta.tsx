"use client"

import { useEffect } from "react"

/**
 * ThemeColorMeta — keeps <meta name="theme-color"> equal to the app's own
 * background.
 *
 * theme-color is what paints the browser/OS chrome around a PWA: the Android
 * address bar and task-switcher header, and the area behind the status bar in a
 * standalone window. A static value can't be right here, because OneCamp's
 * appearance is the user's to choose — light/dark mode plus one of ten accents —
 * so a hardcoded colour is guaranteed to disagree with whatever the person
 * actually set. It was #000000 in the viewport metadata and #FF4D00 in the
 * manifest, and the app shell is neither.
 *
 * Two decisions worth stating:
 *
 *  1. It tracks the BACKGROUND, not the accent. The accents only override
 *     --primary and the chart ramp; --background changes with light/dark alone.
 *     Chrome that matched the accent would paint the address bar bright orange
 *     above a white app — the loud look this app isn't. Matching the background
 *     makes the chrome disappear into the page, which is the point.
 *
 *  2. It READS the resolved value out of the DOM rather than keeping its own
 *     table of hexes. body carries bg-background, so the computed value is by
 *     definition the same colour the user is looking at, and retuning a token in
 *     globals.css can never leave this out of sync. Copying the palette here
 *     would just be a second source of truth waiting to rot.
 *
 * The observer is deliberately indifferent to WHO changed the theme: next-themes
 * writing `dark` onto <html>, ActiveThemeProvider swapping `theme-*` on <body>,
 * or the OS flipping appearance while the mode is "system". Anything that
 * restyles the shell re-runs the read.
 */

/** Normalises any CSS colour the browser understands into #rrggbb. */
function toHexColor(value: string): string | null {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  // Canvas serialises fillStyle to #rrggbb for opaque colours, which converts
  // the oklch() the tokens are authored in — and which older browsers reject in
  // a meta tag — into something universally accepted.
  ctx.fillStyle = "#ffffff"
  ctx.fillStyle = value
  const resolved = ctx.fillStyle
  return typeof resolved === "string" && resolved.startsWith("#") ? resolved : null
}

export function ThemeColorMeta() {
  useEffect(() => {
    const apply = () => {
      const background = getComputedStyle(document.body).backgroundColor
      if (!background) return
      const hex = toHexColor(background)
      if (!hex) return
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (!meta) {
        meta = document.createElement("meta")
        meta.name = "theme-color"
        document.head.appendChild(meta)
      }
      if (meta.content !== hex) meta.content = hex
    }

    // Read after the current frame's mutations land: whoever toggled the theme
    // may set the class in an effect that runs after this one.
    let frame = requestAnimationFrame(apply)
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    const observer = new MutationObserver(schedule)
    const options: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    }
    observer.observe(document.documentElement, options)
    observer.observe(document.body, options)

    // Covers mode="system": the OS flipping appearance restyles the shell.
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", schedule)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      media.removeEventListener("change", schedule)
    }
  }, [])

  return null
}
