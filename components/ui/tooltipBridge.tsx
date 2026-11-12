"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils/helpers/cn"
import type { HandedOn } from "@/lib/keys/escape"

/**
 * Radix's part of a tooltip (FLUIDITY H2, 5 Nov 2026). components/ui/tooltip draws a closed tooltip as its trigger
 * alone and fetches this on idle after the first load, or on a first mouse or keys before that. It joins on the
 * trigger's own node (a Proxy, as disabledTip's OnControl), hears the event that brought it, and leaves after it
 * closes. Nothing here may reach the shared core (swr, the api client, redux, toasts): a lazy chunk that does re-cuts
 * every route's chunks.
 */

export type Ev = "onPointerMove" | "onPointerLeave" | "onPointerDown" | "onFocus" | "onBlur" | "onClick"
type Hand = Partial<Record<Ev, (e: React.SyntheticEvent) => void>>
export type Shown = [string?, string?]
export type Tip = {
  live: boolean
  shown: Shown
  show: React.Dispatch<React.SetStateAction<Shown>>
  el: React.RefObject<HTMLElement | null>
  /** due: the event that brought it, and when (Date.now()); entered/focused: a mouse or a focus holds it. */
  m: {
    hand: Hand
    due: [Ev, React.SyntheticEvent, number] | null
    entered?: boolean
    focused?: boolean
    down?: boolean
    live?: boolean
    open?: boolean
    timer?: number
  }
  join: (due: [Ev, React.SyntheticEvent]) => void
  settle: () => void
  root: TooltipPrimitive.TooltipProps
  /** The nearest TooltipProvider's props: one skip window per provider. */
  p: { d?: number; s?: number; h?: boolean }
}

/**
 * Radix's provider (1.2.8), made once per TooltipProvider, so its skip window holds across tooltips that come and go:
 * after one closes, another opens at once within skipDelayDuration (Radix's own isOpenDelayedRef and timers).
 */
const made = new WeakMap<Tip["p"], ReturnType<typeof provider>>()
function provider({ d = 700, s = 300, h = false }: Tip["p"]) {
  let timer = 0
  const isOpenDelayedRef = { current: true }
  const isPointerInTransitRef = { current: false }
  return {
    isOpenDelayedRef,
    delayDuration: d,
    onOpen: () => {
      window.clearTimeout(timer)
      isOpenDelayedRef.current = false
    },
    onClose: () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => (isOpenDelayedRef.current = true), s)
    },
    isPointerInTransitRef,
    onPointerInTransitChange: (inTransit: boolean) => void (isPointerInTransitRef.current = inTransit),
    disableHoverableContent: h,
  }
}
const providerOf = (p: Tip["p"]) => made.get(p) ?? made.set(p, provider(p)).get(p)!

// Radix's contexts through a scope of its own (createTooltipScope), so the provider's comes from `providerOf`: the
// first context the tooltip package makes is its provider's.
const useScope = TooltipPrimitive.createTooltipScope()
type Scope = { __scopeTooltip: { Tooltip: React.Context<ReturnType<typeof provider>>[] } }

// Radix's trigger on the trigger's own node, so the trigger never remounts.
const Proxy = React.forwardRef<HTMLElement, Hand & { tip: Tip; "data-state"?: string; "aria-describedby"?: string }>(function Proxy(
  { tip, "data-state": state, "aria-describedby": by, ...hand },
  ref,
) {
  const { m, show } = tip
  // Radix's composed ref is new on each render, over the same refs: the first is kept.
  const first = React.useRef(ref).current
  React.useLayoutEffect(() => {
    m.hand = hand
  })
  React.useLayoutEffect(() => {
    const node = tip.el.current
    if (typeof first === "function") first(node)
    else if (first) first.current = node
    return () => {
      m.hand = {}
      if (typeof first === "function") first(null)
      else if (first) first.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  React.useLayoutEffect(() => show((o) => (o[0] === state && o[1] === by ? o : [state, by])), [show, state, by])
  return null
})

// It hears the event that brought it once its trigger and anchor are in. A mouse's delay counts from the mouse, as
// Radix's own does: the open it brings waits only what is left of it once this code is in (a cold first hover waited
// the code's time and then 400 ms), and every later one waits it whole.
function Bridge({ tip, scope, children }: { tip: Tip; scope: Scope; children: React.ReactNode }) {
  const [left, spent] = React.useState(() => {
    const d = tip.root.delayDuration ?? tip.p.d ?? 700
    return tip.m.due && Math.min(d, Math.max(0, d - (Date.now() - tip.m.due[2])))
  })
  React.useEffect(() => {
    const due = tip.m.due
    tip.m.due = null
    if (due) tip.m.hand[due[0]]?.(due[1])
    spent(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const Provider = scope.__scopeTooltip.Tooltip[0].Provider
  return (
    <Provider value={providerOf(tip.p)}>
      <TooltipPrimitive.Root {...tip.root} delayDuration={left ?? tip.root.delayDuration} {...scope}>
        <TooltipPrimitive.Trigger asChild {...scope}>
          <Proxy tip={tip} />
        </TooltipPrimitive.Trigger>
        {children}
      </TooltipPrimitive.Root>
    </Provider>
  )
}

// Closes on Esc, and the press goes on (lib/keys/escape).
const passOn = (e: KeyboardEvent & HandedOn) => void (e.escapeHandedOn = true)

/** Radix's own parts, for disabledTip's root of its own: through this chunk, so no other chunk carries Radix's tooltip. */
export const { Provider, Root, Trigger } = TooltipPrimitive

/** The chip: in our Tooltip's Radix part, or (no tip) in a Radix root of the caller's own, as disabledTip's. */
export const TooltipChip = React.forwardRef<HTMLDivElement, TooltipPrimitive.TooltipContentProps & { tip?: Tip | null }>(function TooltipChip(
  { tip, className, sideOffset = 4, ...props },
  ref,
) {
  const own = useScope(undefined) as unknown as Scope
  const scope = tip ? own : {}
  const chip = (
    <TooltipPrimitive.Portal {...scope}>
      <TooltipPrimitive.Content
        {...scope}
        ref={ref}
        onEscapeKeyDown={passOn}
        sideOffset={sideOffset}
        className={cn(
          // Ink, not the accent: a tooltip is a label, one chip across the app (design v3 M3, admin §8 H6).
          "z-[var(--z-tooltip)] flex min-h-6 max-w-xs items-center overflow-hidden rounded-sm bg-[var(--tooltip-bg)] px-2 py-1 text-2xs font-medium text-white text-pretty duration-[120ms] ease-standard animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-0.5 data-[side=left]:slide-in-from-right-0.5 data-[side=right]:slide-in-from-left-0.5 data-[side=top]:slide-in-from-bottom-0.5",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
  return tip ? (
    <Bridge tip={tip} scope={own}>
      {chip}
    </Bridge>
  ) : (
    chip
  )
})
