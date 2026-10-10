"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils/helpers/cn"
import {useMedia} from "@/context/MediaQueryContext";
import {useLongPress} from "@/hooks/useLongPress";

const TooltipProvider = TooltipPrimitive.Provider

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

const Tooltip = ({ children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) => {
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
            <TooltipPrimitive.Root {...props} {...rootProps}>
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
        // Ink, not the accent. A tooltip is a label, and an orange label on every
        // hovered icon spent the accent on the least important text on screen
        // (DESIGN.md, accent budget). Inverted ink reads in both themes and
        // needs no shadow to separate from the page.
        "z-[var(--z-tooltip)] max-w-xs overflow-hidden rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background text-pretty duration-150 ease-standard animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
