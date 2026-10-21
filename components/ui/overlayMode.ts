"use client"

import * as React from "react"

/** Overlays are sheets on a phone, portrait or landscape; tablets keep popovers (design/drawers-v3 §5.4). */
export const SHEET_QUERY = "(max-width: 639px), (pointer: coarse) and (max-height: 500px)"

const query = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(SHEET_QUERY) : null)

function subscribe(changed: () => void) {
  const q = query()
  q?.addEventListener?.("change", changed)
  return () => q?.removeEventListener?.("change", changed)
}

/** Whether overlays open as sheets here; false on the server. */
export function useSheetMode(): boolean {
  return React.useSyncExternalStore(subscribe, () => Boolean(query()?.matches), () => false)
}
