import * as React from "react"

// Excalidraw's own parts, by the selectors its markup (0.18) answers to: one
// home, so an upgrade of Excalidraw touches one file (CR-85).

/** The tool row (its shapes): the bottom row's middle on a computer, at the board's top in the MobileMenu. In the MobileMenu its footer is a second .App-toolbar, after it. */
export const TOOL_ROW = ".App-toolbar"
/** The tool row in Excalidraw's MobileMenu, which it draws on its own box: under 730 px wide, or under 500 tall and 1000 wide. */
export const PHONE_TOOL_ROW = ".App-toolbar--mobile"
/** The tool row's positioned box on a computer: the hint over the row comes and goes in it. */
export const TOOL_SECTION = ".App-menu_top .shapes-section"
/** The MobileMenu's footer at the board's foot (undo, redo, the style palette): its island, as .App-bottom-bar spans the board. */
export const PHONE_FOOTER = ".App-bottom-bar > .Island"
/** The zoom and undo cluster, which the MobileMenu doesn't draw: the map's button is portaled into it. */
export const ZOOM_CLUSTER = ".layer-ui__wrapper__footer-left > .Stack > section"
/** Excalidraw's container, and the class it carries while it draws its phone UI (the MobileMenu). */
export const CONTAINER = ".excalidraw"
export const PHONE_UI = "excalidraw--mobile"

/**
 * Excalidraw's own rule for its phone UI (App.isMobileBreakpoint, 0.18.1) on its container's box: under 730 px
 * wide, or under 500 tall and 1000 wide. excalidrawPart.test holds these numbers to the installed package's.
 */
export const PHONE_UI_BELOW = { width: 730, landscapeHeight: 500, landscapeWidth: 1000 } as const
export function drawsPhoneUI(width: number, height: number): boolean {
  return width < PHONE_UI_BELOW.width || (height < PHONE_UI_BELOW.landscapeHeight && width < PHONE_UI_BELOW.landscapeWidth)
}

const NONE: readonly HTMLElement[] = []
const same = (a: readonly HTMLElement[], b: readonly HTMLElement[]) => a.length === b.length && a.every((e, i) => e === b[i])

/**
 * Every part of the UI inside `host` that `selector` matches (Excalidraw's tool
 * bar or phone footer, the board's own bars), in the page's order: found once
 * drawn, and found again as parts come and go (Excalidraw draws its UI a moment
 * after it mounts, and a selection's bar comes with the selection); empty while
 * there are none or `on` is false. The host is the element itself (a callback
 * ref's state), never a ref read once: a page that draws a loading state first
 * mounts its host later, and the look starts then.
 */
export function useExcalidrawParts(host: HTMLElement | null, selector: string, on = true): readonly HTMLElement[] {
  const [parts, setParts] = React.useState<readonly HTMLElement[]>(NONE)
  React.useEffect(() => {
    if (!on || !host) return setParts(NONE)
    const look = () => {
      const found = Array.from(host.querySelectorAll<HTMLElement>(selector))
      setParts((prev) => (same(prev, found) ? prev : found))
    }
    look()
    // Batched by the browser, and only for nodes added or removed.
    const mo = new MutationObserver(look)
    mo.observe(host, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [host, selector, on])
  return parts
}

/** The first such part (Excalidraw's tool bar, its phone footer); null while it isn't there. */
export function useExcalidrawPart(host: HTMLElement | null, selector: string, on = true): HTMLElement | null {
  return useExcalidrawParts(host, selector, on)[0] ?? null
}

/**
 * Whether Excalidraw draws its phone UI inside `host`: its own switch, the class on its container, once the
 * container is there; before that, its rule on host's box, so what keys on it is placed once, before the canvas
 * paints, and doesn't jump when Excalidraw mounts. It answers as the switch flips: Excalidraw swaps its whole UI
 * (MobileMenu for the desktop rows) in the same commit, so the nodes it adds and removes are what wake the look.
 */
export function useExcalidrawPhoneUI(host: HTMLElement | null): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useLayoutEffect(() => {
    if (!host) return
    let box: { width: number; height: number } | null = null
    const look = () => {
      const drawn = host.querySelector(CONTAINER)
      if (drawn) return setPhone(drawn.classList.contains(PHONE_UI))
      box ??= host.getBoundingClientRect()
      setPhone(drawsPhoneUI(box.width, box.height))
    }
    look()
    const mo = new MutationObserver(look)
    mo.observe(host, { childList: true, subtree: true })
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      box = { width: entry.contentRect.width, height: entry.contentRect.height }
      look()
    })
    ro.observe(host)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [host])
  return phone
}
