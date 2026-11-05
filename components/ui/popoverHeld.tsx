"use client"

import * as React from "react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

/** What components/ui/popoverOnDemand's holder hands its content: its state, its id, and its trigger's and anchor's elements. */
export type Held = {
  open: boolean
  onOpenChange: (open: boolean) => void
  id: string
  trigger: React.MutableRefObject<HTMLElement | null>
  anchor: React.MutableRefObject<HTMLElement | null>
}

export type HeldContentProps = React.ComponentPropsWithoutRef<typeof PopoverContent>

/**
 * popoverOnDemand's content and Radix's popover with it (V-415): one chunk,
 * loaded with a trigger's first hover, focus or open, never with a page's
 * first screen. Radix's root is held open by the holder, and its anchor is
 * the holder's trigger or anchor element. That trigger is one Radix can't
 * see, so this keeps its non-modal popover's ways for it: a press on the
 * trigger while open only closes, and the focus goes back to the trigger
 * after a close that no press or focus elsewhere made.
 */
export const HeldContent = React.forwardRef<HTMLDivElement, HeldContentProps & { held: Held }>(function HeldContent(
  { held, onInteractOutside, onCloseAutoFocus, ...props },
  ref,
) {
  const { open, onOpenChange, id, trigger, anchor } = held
  // Radix's PopoverContentNonModal's own, for the trigger it can't see.
  const outside = React.useRef({ any: false, pointer: false })
  // The content's place: the Anchor when there is one, as Radix's (hasCustomAnchor); else the trigger.
  const at = React.useMemo(() => ({ get current() { return anchor.current ?? trigger.current } }), [anchor, trigger])
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={at as React.RefObject<HTMLElement>} />
      <PopoverContent
        ref={ref}
        id={id}
        {...props}
        onInteractOutside={(e) => {
          onInteractOutside?.(e)
          const type = e.detail.originalEvent.type
          if (!e.defaultPrevented) outside.current = { any: true, pointer: outside.current.pointer || type === "pointerdown" }
          // A press on the trigger is the trigger's (it closes): a close here too would open it again.
          if (trigger.current?.contains(e.target as Node)) e.preventDefault()
          // Safari's focus after a press elsewhere is that press's.
          if (type === "focusin" && outside.current.pointer) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          if (!e.defaultPrevented) {
            if (!outside.current.any) trigger.current?.focus()
            e.preventDefault()
          }
          outside.current = { any: false, pointer: false }
        }}
      />
    </Popover>
  )
})
