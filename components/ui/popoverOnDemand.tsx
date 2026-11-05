"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { lazyView } from "@/lib/lazy/lazyView"
import type { Held, HeldContentProps } from "@/components/ui/popoverHeld"

/**
 * components/ui/popover's parts with Radix's code on demand (V-415): it loads
 * (components/ui/popoverHeld) on a trigger's first hover, focus or open. A
 * drop-in for a held (open, onOpenChange), non-modal popover whose trigger or
 * anchor is asChild, drawn from its first open: no defaultOpen, modal or
 * forceMount. An Anchor places the content when there is one, as in Radix.
 */
const part = lazyView(() => import("@/components/ui/popoverHeld"))
/** Radix's code, loaded (never throws): pages warm it, tests wait on it. */
export const loadPopover = () => part.prefetch()

type El = HTMLElement | null
const HeldBy = React.createContext<Held | null>(null)

export function Popover({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  const id = React.useId()
  const trigger = React.useRef<El>(null)
  const anchor = React.useRef<El>(null)
  const held = React.useMemo(() => ({ open, onOpenChange, id, trigger, anchor }), [open, onOpenChange, id])
  return <HeldBy.Provider value={held}>{children}</HeldBy.Provider>
}

function useHeld(): Held {
  const held = React.useContext(HeldBy)
  if (!held) throw new Error("A popover's part is drawn outside its Popover")
  return held
}

type PartProps = React.HTMLAttributes<HTMLElement> & { asChild: true; children: React.ReactElement }

/** A trigger's or an anchor's element, held, warming the code on hover or focus. */
function partProps({ asChild: _, onPointerEnter, onFocus, ...props }: PartProps, ref: React.ForwardedRef<HTMLElement>, held: Held, trigger: boolean) {
  const warm = () => void part.prefetch()
  let mine: El = null
  return {
    ...props,
    ref: (node: El) => {
      // Each part lets go of its own element only (CR-206).
      const own = trigger ? held.trigger : held.anchor
      if (node) own.current = mine = node
      else if (own.current === mine) own.current = null
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => (onPointerEnter?.(e), warm()),
    onFocus: (e: React.FocusEvent<HTMLElement>) => (onFocus?.(e), warm()),
  }
}

export const PopoverAnchor = React.forwardRef<HTMLElement, PartProps>(function PopoverAnchor(props, ref) {
  return <Slot {...partProps(props, ref, useHeld(), false)} />
})

export const PopoverTrigger = React.forwardRef<HTMLElement, PartProps>(function PopoverTrigger({ onClick, ...props }, ref) {
  const held = useHeld()
  const { open, onOpenChange, id } = held
  return (
    <Slot
      // type="button", as Radix's trigger.
      {...{ type: "button" }}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={id}
      data-state={open ? "open" : "closed"}
      {...partProps(props, ref, held, true)}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) onOpenChange(!open)
      }}
    />
  )
})

export const PopoverContent = React.forwardRef<HTMLDivElement, HeldContentProps>(function PopoverContent(props, ref) {
  const held = useHeld()
  const ui = part.useLoaded(held.open)
  // Kept from its first open, so a close plays out.
  const [opened, setOpened] = React.useState(held.open)
  if (held.open && !opened) setOpened(true)
  return ui && opened ? <ui.HeldContent ref={ref} held={held} {...props} /> : null
})
