/**
 * The shared popover as tests draw it (components/ui/popover): in place, with
 * no floating layer (jsdom lays nothing out), and the anchor it was given
 * kept in `anchored`, so a test can ask it what Radix would: where the card
 * stands now. A test opts in:
 *
 *   vi.mock("@/components/ui/popover", () => import("@/lib/testing/popoverAnchor"))
 */

import * as React from "react"

type Measurable = { getBoundingClientRect(): DOMRect; contextElement?: Element }

/** The virtual anchor the last open popover was given. */
export const anchored: { current: Measurable | null } = { current: null }

const Open = React.createContext(false)

export function Popover({ open = false, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }) {
  return <Open.Provider value={open}>{children}</Open.Provider>
}

export function PopoverAnchor({ virtualRef }: { virtualRef?: React.RefObject<Measurable | null> }) {
  const open = React.useContext(Open)
  if (open && virtualRef?.current) anchored.current = virtualRef.current
  return null
}

export const PopoverTrigger = React.forwardRef<HTMLElement, { asChild?: boolean; children?: React.ReactNode }>(function PopoverTrigger({ children }, ref) {
  return React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>, { ref }) : <>{children}</>
})

// What Radix's content takes that a div doesn't.
const RADIX = ["side", "align", "sideOffset", "alignOffset", "collisionPadding", "avoidCollisions", "container", "portalled", "forceMount", "onOpenAutoFocus", "onCloseAutoFocus", "onFocusOutside", "onPointerDownOutside", "onInteractOutside", "onEscapeKeyDown", "hideWhenDetached", "sticky", "updatePositionStrategy"]

export const PopoverContent = React.forwardRef<HTMLDivElement, { children?: React.ReactNode } & Record<string, unknown>>(function PopoverContent({ children, ...props }, ref) {
  const open = React.useContext(Open)
  if (!open) return null
  const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !RADIX.includes(k))) as React.HTMLAttributes<HTMLDivElement>
  return (
    <div ref={ref} {...rest}>
      {children as React.ReactNode}
    </div>
  )
})
