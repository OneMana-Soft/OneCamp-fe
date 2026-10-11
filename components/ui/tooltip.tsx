"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils/helpers/cn"
import {useMedia} from "@/context/MediaQueryContext";
import {useLongPress} from "@/hooks/useLongPress";

/** The provider, with the 300ms window in which moving between tooltips skips the delay. */
const TooltipProvider = ({ skipDelayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider skipDelayDuration={skipDelayDuration} {...props} />
)

interface TooltipMobileContextType {
    isMobile: boolean
    longPressProps: any
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    isLongPressRef: React.MutableRefObject<boolean>
}

const TooltipMobileContext = React.createContext<TooltipMobileContextType>({
    isMobile: false,
    longPressProps: {},
    isOpen: false,
    setIsOpen: () => {},
    isLongPressRef: { current: false }
})

/**
 * How long a tooltip waits (design v3, admin §8 H6): 400ms, and none when the
 * pointer moves on from another tooltip within 300ms (the provider's
 * skipDelayDuration). Set on each root, so it holds under the app's provider
 * too; a caller's own delayDuration still wins.
 */
const TOOLTIP_DELAY_MS = 400

const Tooltip = ({ children, delayDuration = TOOLTIP_DELAY_MS, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) => {
    const { isMobile } = useMedia()
    const [isOpen, setIsOpen] = React.useState(false)
    const isLongPressRef = React.useRef(false)

    const onLongPress = React.useCallback(() => {
        if (isMobile) {
            isLongPressRef.current = true
            setIsOpen(true)
        }
    }, [isMobile])
 
    const longPressProps = useLongPress(onLongPress, { threshold: 500 })

    const rootProps = isMobile ? {
        open: isOpen,
        onOpenChange: (newOpen: boolean) => {
            if (!newOpen) {
                setIsOpen(false)
                props.onOpenChange?.(false)
            }
        }
    } : {}

    const contextValue = React.useMemo(() => ({
        isMobile,
        longPressProps,
        isOpen,
        setIsOpen,
        isLongPressRef
    }), [isMobile, longPressProps, isOpen, setIsOpen])

    return (
        <TooltipMobileContext.Provider value={contextValue}>
            <TooltipPrimitive.Root delayDuration={delayDuration} {...props} {...rootProps}>
                {children}
            </TooltipPrimitive.Root>
        </TooltipMobileContext.Provider>
    )
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ className, onClick, ...props }, ref) => {
    const { isMobile, longPressProps, isLongPressRef } = React.useContext(TooltipMobileContext)

    const mergedRef = React.useCallback((element: any) => {
        // Handle external ref
        if (typeof ref === 'function') ref(element)
        else if (ref) (ref as any).current = element

        // Handle long press ref
        if (isMobile && longPressProps.ref) {
            if (typeof longPressProps.ref === 'function') longPressProps.ref(element)
            else if (longPressProps.ref) (longPressProps.ref as any).current = element
        }
    }, [isMobile, longPressProps.ref, ref])

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        if (isMobile && isLongPressRef.current) {
             e.preventDefault()
             e.stopPropagation()
             isLongPressRef.current = false
             return
        }
        onClick?.(e)
    }, [isMobile, isLongPressRef, onClick])

    return (
        <TooltipPrimitive.Trigger
            ref={mergedRef}
            className={className}
            onClick={handleClick}
            {...props}
        />
    )
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal >
    <TooltipPrimitive.Content
      ref={ref}

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
