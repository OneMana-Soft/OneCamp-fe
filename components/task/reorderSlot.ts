"use client"

import { createContext, createElement as h, useEffect, useState, type ComponentType, type ReactNode, type TouchEvent } from "react"
import type { TaskInfoInterface } from "@/types/task"

/** What a list in a project's manual order needs to let its rows be moved (L-1). */
export interface ListReorder {
  projectId: string
  /** In the manual order: rows move. Otherwise a move asks to switch. */
  manual: boolean
  /** The sort instead, in words ("due date"). */
  sortedBy?: string
  onManual: () => void
}

type Grip = ComponentType<{ task: TaskInfoInterface; editable: boolean }>
/** What the drag's layer lends its rows: a grip, a phone row's hold, what a grip does. */
export type Lent = { Grip?: Grip; hold?: (task: TaskInfoInterface, e: TouchEvent<HTMLElement>) => void; actions?: unknown }
export const ReorderGrip = createContext<Lent["Grip"]>(undefined)
export const ReorderHold = createContext<Lent["hold"]>(undefined)
export const ReorderActions = createContext<unknown>(undefined)
export const ReorderLend = createContext<(lent: Lent) => void>(() => undefined)

/** The rows under the drag's providers from the first frame, its layer beside them: its coming draws no row anew. */
export function ReorderHost({ children }: { children: ReactNode }) {
  const [lent, lend] = useState<Lent>({})
  return h(ReorderLend.Provider, { value: lend }, h(ReorderGrip.Provider, { value: lent.Grip }, h(ReorderHold.Provider, { value: lent.hold }, h(ReorderActions.Provider, { value: lent.actions }, children))))
}

type Layer = typeof import("@/components/task/listReorder")
let layer: Layer | null = null

/** The drag's chunk, fetched once the page is idle: no first screen carries it. */
export function useReorderLayer(on: boolean): Layer["ReorderLayer"] | null {
  const [mod, setMod] = useState(layer)
  useEffect(() => {
    if (!on || mod) return
    let live = true
    const go = () => void import("@/components/task/listReorder").then((m) => live && setMod((layer = m)))
    // Safari and jsdom have no idle callback.
    const idle = typeof window.requestIdleCallback === "function"
    const id = idle ? window.requestIdleCallback(go, { timeout: 1500 }) : window.setTimeout(go, 1)
    return () => {
      live = false
      if (idle) window.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [on, mod])
  return on && mod ? mod.ReorderLayer : null
}
