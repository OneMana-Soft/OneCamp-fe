"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils/helpers/cn"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { useLongPress } from "@/hooks/useLongPress"
import type { HandedOn } from "@/lib/keys/escape"

/** The provider, with the 300ms window in which moving between tooltips skips the delay. */
const TooltipProvider = ({ skipDelayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider skipDelayDuration={skipDelayDuration} {...props} />
)

/** Where a tooltip's long press listens: its trigger. */
const Press = React.createContext<React.RefObject<HTMLElement | null> | null>(null)

/**
 * A tooltip follows the input, not the width (21 Oct 2026). With a mouse it
 * waits 400ms (design v3, admin §8 H6), none when the pointer moves on from
 * another within the provider's 300ms, and keyboard focus shows it. On a
 * touch screen (lib/ui/touchScreen: a phone either way up, a tablet) only a
 * long press shows it, never a tap or the focus a closing menu gives back:
 * read by width, a phone held sideways put More's label over Save version.
 * A caller's open and onOpenChange still decide, for a long press as well.
 */
const Tooltip = ({ children, delayDuration = 400, open, defaultOpen = false, onOpenChange, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) => {
  const [own, setOwn] = React.useState(defaultOpen)
  const set = (next: boolean) => {
    if (open === undefined) setOwn(next)
    onOpenChange?.(next)
  }
  // One callback for the press, reading the latest `set`.
  const latest = React.useRef(set)
  React.useEffect(() => {
    latest.current = set
  })
  const press = useLongPress(React.useCallback(() => latest.current(true), []), { threshold: 500 })
  return (
    <Press.Provider value={press.ref as React.RefObject<HTMLElement | null>}>
      <TooltipPrimitive.Root delayDuration={delayDuration} {...props} open={open ?? own} onOpenChange={(next) => (next && isTouchScreen() ? undefined : set(next))}>
        {children}
      </TooltipPrimitive.Root>
    </Press.Provider>
  )
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>((props, ref) => {
  const press = React.useContext(Press)
  const refs = React.useCallback(
    (el: HTMLButtonElement | null) => {
      if (press) press.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [press, ref],
  )
  return <TooltipPrimitive.Trigger ref={refs} {...props} />
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

// Closes on Esc, and the press goes on (lib/keys/escape).
const passOn = (e: KeyboardEvent & HandedOn) => void (e.escapeHandedOn = true)

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal >
    <TooltipPrimitive.Content
      ref={ref}
      onEscapeKeyDown={passOn}

      sideOffset={sideOffset}
      className={cn(
        // Ink, not the accent (DESIGN.md, accent budget): a tooltip is a label.
        // Design v3 (shell M3): 24px, r6, padding 0 8, 12/510 white on ink
        // (#2A2B30 in dark, --tooltip-bg), sliding 2px from its trigger with
        // the fade, 120ms, no scale. Long text wraps rather than clips.
        // Admin §8 H6 asks the same chip: 12/16 510, r6, padding 4/8, no
        // arrow. Its dark ground stays the shell's --tooltip-bg (#2A2B30)
        // rather than an inverted light chip, so one tooltip reads the same
        // across the app.
        "z-[var(--z-tooltip)] flex min-h-6 max-w-xs items-center overflow-hidden rounded-sm bg-[var(--tooltip-bg)] px-2 py-1 text-2xs font-medium text-white text-pretty duration-[120ms] ease-standard animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-0.5 data-[side=left]:slide-in-from-right-0.5 data-[side=right]:slide-in-from-left-0.5 data-[side=top]:slide-in-from-bottom-0.5",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
