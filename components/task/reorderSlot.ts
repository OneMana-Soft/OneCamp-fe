"use client"

import { createContext, createElement as h, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ComponentType, type ReactNode, type TouchEvent } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
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

/**
 * The rows under the drag's providers from the first frame, its layer beside them: its coming draws no row anew.
 * Hidden (a kept tab, React's Activity), the layer's cleanups run, the host's first: it takes nothing back then, and
 * the same lent again on show changes nothing, so a hidden list's rows draw nothing (fluid-08: 1,900 a hide).
 */
export function ReorderHost({ children }: { children: ReactNode }) {
  const [lent, setLent] = useState<Lent>({})
  const shown = useRef(true)
  useLayoutEffect(() => {
    shown.current = true
    return () => void (shown.current = false)
  }, [])
  const lend = useCallback((next: Lent) => {
    if (!shown.current && !next.Grip && !next.hold && !next.actions) return
    setLent((was) => (was.Grip === next.Grip && was.hold === next.hold && was.actions === next.actions ? was : next))
  }, [])
  return h(ReorderLend.Provider, { value: lend }, h(ReorderGrip.Provider, { value: lent.Grip }, h(ReorderHold.Provider, { value: lent.hold }, h(ReorderActions.Provider, { value: lent.actions }, children))))
}

type Layer = typeof import("@/components/task/listReorder")
const layer = lazyPart<ComponentProps<Layer["ReorderLayer"]>>(() => import("@/components/task/listReorder").then((m) => m.ReorderLayer))
// After the first idle moment, lists draw it at once.
let idled = false

/** The drag's layer (lib/lazy/lazyPart), fetched when the page is idle: no first screen carries it; till then, or offline, no grips. */
export function useReorderLayer(on: boolean) {
  const [ready, setReady] = useState(idled)
  useEffect(() => {
    if (!on || ready) return
    const go = () => {
      idled = true
      void layer.warm()
      setReady(true)
    }
    // Safari and jsdom have no idle callback.
    const idle = typeof window.requestIdleCallback === "function"
    const id = idle ? window.requestIdleCallback(go, { timeout: 1500 }) : window.setTimeout(go, 1)
    return () => {
      if (idle) window.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [on, ready])
  return on && ready ? layer.Part : null
}
