"use client"

import type React from "react"
import { cn } from "@/lib/utils/helpers/cn"

interface TouchableDivProps {
    /** Called when a press ends. */
    onTouch?: () => void
    onClick?: () => void
    className?: string
    children?: React.ReactNode
    /** @deprecated Kept so callers compile; the press is a CSS tint now. */
    rippleBrightness?: number
    /** @deprecated Kept so callers compile; the press is a CSS tint now. */
    rippleDuration?: number
}

/**
 * A row that answers a touch: it tints while it is pressed.
 *
 * It used to draw a Material ripple, and that cost more than it showed. Every
 * touchstart, the first touch of every scroll included, set React state, so
 * the row and the whole message inside it rendered again, twice (once to add
 * the ripple, once 600 to 800ms later to clear it). The ripple then animated
 * width and height, laying the row out on every frame, from a keyframe that
 * styled-jsx injected for each row.
 *
 * The tint is :active, so the browser draws it, drops it when the touch turns
 * into a scroll, and nothing re-renders. Its colour is the neutral step a list
 * row hovers to, on the 120ms press timing.
 */
export default function TouchableDiv({ onTouch, onClick, className, children }: TouchableDivProps) {
    return (
        <div
            className={cn("relative overflow-hidden cursor-pointer transition-colors active:bg-highlight", className)}
            onClick={onClick}
            onTouchEnd={onTouch}
        >
            {children}
        </div>
    )
}
