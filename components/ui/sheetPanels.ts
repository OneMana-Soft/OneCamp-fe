"use client"

import * as React from "react"

// A choice made in a sheet opens as a panel of it, never a sheet over it (design/drawers-v3 §1.5).
export type Panel = { key: string; title: string; onBack: () => void }
export type Panels = { push: (panel: Panel) => void; pop: (key: string) => void; top: Panel | null; host: HTMLElement | null }
export const PanelsContext = React.createContext<Panels | null>(null)

/** A panel of this sheet while `open`; its content goes in `host` (a portal) while on top. */
export function useSheetPanel(open: boolean, title: string, onBack: () => void): { inSheet: boolean; host: HTMLElement | null } {
  const panels = React.useContext(PanelsContext)
  const key = React.useId()
  const back = React.useRef(onBack)
  React.useEffect(() => {
    back.current = onBack
  })
  const push = panels?.push
  const pop = panels?.pop
  React.useLayoutEffect(() => {
    if (!push || !pop || !open) return
    push({ key, title, onBack: () => back.current() })
    return () => pop(key)
  }, [push, pop, open, key, title])
  return { inSheet: !!panels, host: panels && open && panels.top?.key === key ? panels.host : null }
}
