"use client"

import type React from "react"
import { useEffect } from "react"
import { motion, useAnimation, useDragControls, type PanInfo } from "framer-motion"
import { cn } from "@/lib/utils/helpers/cn"

interface DraggableDrawerProps {
    children: React.ReactNode
    initialHeight?: number
    isExpanded: boolean
    setIsExpanded: (isExpanded: boolean) => void
}

const DraggableDrawer: React.FC<DraggableDrawerProps> = ({
                                                             children,
                                                             initialHeight = 200,
                                                             isExpanded,
                                                             setIsExpanded,
                                                         }) => {
    const controls = useAnimation()
    const dragControls = useDragControls()

    // Handle height changes based on expanded state and initialHeight updates
    useEffect(() => {
        const targetHeight = isExpanded ? "100vh" : Math.min(initialHeight, window.innerHeight);
        
        // We use a quick animation when adjusting for text (initialHeight), 
        // and standard animation for expanding.
        controls.start(
            { height: targetHeight },
            { duration: 0.2, ease: "easeOut" }
        )
    }, [isExpanded, initialHeight, controls])

    // Publish the drawer's current collapsed height to the document root
    // as a CSS variable (`--mobile-drawer-h`) so siblings — for example the
    // typing indicator — can anchor themselves just above the drawer
    // without hardcoding a magic number. We track collapsed height
    // because when the drawer is expanded it covers the viewport, so any
    // sibling's anchor positioning is irrelevant.
    //
    // This is safe with multiple drawers mounting/unmounting in sequence
    // (e.g. switching between chats): the most recently-mounted drawer
    // owns the variable while it's mounted, and clears it on unmount.
    // In the rare case two drawers mount simultaneously the last writer
    // wins, which still produces a correct value within ~1 frame.
    useEffect(() => {
        if (typeof document === "undefined") return
        const cap = typeof window !== "undefined" ? window.innerHeight : initialHeight
        const h = Math.max(0, Math.min(initialHeight, cap))
        document.documentElement.style.setProperty("--mobile-drawer-h", `${h}px`)
        return () => {
            document.documentElement.style.removeProperty("--mobile-drawer-h")
        }
    }, [initialHeight])

    // Handle drag end to determine if the drawer should expand or collapse
    const handleDragEnd = (
        event: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo
    ) => {
        const thresholdDistance = window.innerHeight * 0.2 // 20% of screen height
        const thresholdVelocity = 500 // minimum velocity to count as a flick
        
        // Check for quick flick or passing the distance threshold
        if (info.offset.y < -thresholdDistance || info.velocity.y < -thresholdVelocity) {
            setIsExpanded(true)
        } else if (info.offset.y > thresholdDistance || info.velocity.y > thresholdVelocity) {
            setIsExpanded(false)
        } else {
            // Snap back to current state
            controls.start(
                { height: isExpanded ? "100vh" : initialHeight },
                { duration: 0.3 }
            )
        }
    }

    // Handle dragging to animate in both directions
    const handleDrag = (
        event: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo
    ) => {
        // Calculate the new height based on the drag direction
        const currentHeight = isExpanded ? window.innerHeight : initialHeight
        const dragOffset = info.offset.y
        const newHeight = currentHeight - dragOffset

        // Ensure the height stays within bounds (initialHeight to 100vh)
        const constrainedHeight = Math.min(
            Math.max(newHeight, initialHeight),
            window.innerHeight
        )

        // Update the height in real-time smoothly
        controls.set({ height: constrainedHeight })
    }

    return (
        <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0}
            dragMomentum={false}
            style={{ zIndex: 350 }}
            onDrag={handleDrag} // Real-time height adjustment during drag
            onDragEnd={handleDragEnd}
            animate={controls}
            initial={{ height: initialHeight }}
            className="fixed bottom-0 left-0 border-t right-0 rounded-t-3xl opacity-100 bg-background top-shadow"
        >
            <div 
                className="w-full py-3 flex justify-center items-center cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={(e) => dragControls.start(e)}
            >
                <div className="h-1.5 w-[100px] rounded-full bg-muted-foreground/40"></div>
            </div>
            <div
                className="overflow-y-auto p-1 pt-0 [touch-action:auto]"
                style={{ height: "calc(100% - 30px)" }}
            >
                {children}
            </div>
        </motion.div>
    )
}

export default DraggableDrawer