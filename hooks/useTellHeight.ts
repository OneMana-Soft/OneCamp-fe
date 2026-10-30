import * as React from "react"

/**
 * Tells onHeight an element's height while it's drawn, through resizes, and 0
 * when it goes. The shared way a bar says how tall it is to whatever makes room
 * for it: a call's bars over the dock and its captions, which the stage makes
 * room for, and a doc's connection row docked under a phone's top bar, which
 * toasts come in under (components/docEditor/ConnectionPill). key names the
 * element the ref holds when that changes. Its own file, not rootPlace.ts: a
 * task's page reaches that one for its composer.
 */
export function useTellHeight(el: React.RefObject<HTMLElement | null>, onHeight: (px: number) => void, key?: unknown): void {
  React.useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const tell = () => onHeight(node.getBoundingClientRect().height)
    tell()
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(tell) : null
    watch?.observe(node)
    return () => {
      watch?.disconnect()
      onHeight(0)
    }
  }, [el, onHeight, key])
}
