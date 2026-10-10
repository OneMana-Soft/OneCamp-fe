"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useRef } from "react"
import { motion, useAnimation, useDragControls, useReducedMotion, type PanInfo } from "framer-motion"

interface DraggableDrawerProps {
    children: React.ReactNode
    initialHeight?: number
    isExpanded: boolean
    setIsExpanded: (isExpanded: boolean) => void
}

/** How far the sheet settles from when it opens or closes, in px: a cue, not a journey. */
const SETTLE_PX = 24

/**
 * The phone's composer sheet: on every channel, DM, group chat and thread.
 *
 * Its height is the composer's content, or the whole screen when it is
 * expanded, and it changes in ONE step. It used to tween height for 200ms
 * with Motion on every change, which lays the page out on every frame: on
 * each new line typed, and on every open and close. Opening and closing now
 * settle by transform (a short slide on y, compositor only, and none at all
 * for prefers-reduced-motion), so the change still reads as motion.
 *
 * The drag handle follows the finger by setting the height directly on the
 * element (a gesture, not an animation, and no React render per frame). So
 * the height is never React's style prop: React writes only a style that
 * changed, and a drag that let go without changing state would keep the
 * dragged height. It is written here, before paint, from the state.
 *
 * The height is the whole sheet's, the home-indicator padding inside it, so
 * the sheet's top is where `--mobile-drawer-h` says (the typing indicator
 * sits there).
 */
const DraggableDrawer: React.FC<DraggableDrawerProps> = ({
                                                             children,
                                                             initialHeight = 200,
                                                             isExpanded,
                                                             setIsExpanded,
                                                         }) => {
    const settle = useAnimation()
    const dragControls = useDragControls()
    const reduceMotion = useReducedMotion()
    const sheetRef = useRef<HTMLDivElement>(null)

    // 100dvh, not 100vh: on mobile Safari 100vh is the LARGEST viewport (URL
    // bar hidden), so expanding overshot the visible area and pushed the
    // toolbar off-screen. dvh tracks the viewport as it actually is. The
    // sheet is never taller than the screen (max-h-dvh): reading the window's
    // height here, in render, forced a layout on every render of every
    // composer, and a thread renders its composer many times as it opens.
    const height = isExpanded ? "100dvh" : `${initialHeight}px`
    useLayoutEffect(() => {
        if (sheetRef.current) sheetRef.current.style.height = height
    }, [height])

    // Opening or closing settles by transform: from a little below when it
    // opens, a little above when it closes. Never on the first render.
    const shownExpanded = useRef(isExpanded)
    useEffect(() => {
        if (shownExpanded.current === isExpanded) return
        shownExpanded.current = isExpanded
        if (reduceMotion) return
        void settle.start(
            { y: [isExpanded ? SETTLE_PX : -SETTLE_PX, 0] },
            { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] },
        )
    }, [isExpanded, reduceMotion, settle])

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
    // Not capped at the window's height: reading it forces a layout, and a
    // composer taller than the screen is the whole screen (max-h-dvh), which
    // covers whatever anchors to this line.
    useEffect(() => {
        if (typeof document === "undefined") return
        const h = Math.max(0, initialHeight)
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

        // Back to the height for the state; a change of state below moves it on.
        if (sheetRef.current) sheetRef.current.style.height = height

        // Check for quick flick or passing the distance threshold
        if (info.offset.y < -thresholdDistance || info.velocity.y < -thresholdVelocity) {
            setIsExpanded(true)
        } else if (info.offset.y > thresholdDistance || info.velocity.y > thresholdVelocity) {
            setIsExpanded(false)
        }
    }

    // The sheet follows the finger: its height set directly, between the
    // composer's own height and the whole screen.
    const handleDrag = (
        event: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo
    ) => {
        const screen = window.innerHeight
        const collapsedHeight = Math.min(initialHeight, screen)
        const currentHeight = isExpanded ? screen : collapsedHeight
        const constrainedHeight = Math.min(Math.max(currentHeight - info.offset.y, collapsedHeight), screen)
        if (sheetRef.current) sheetRef.current.style.height = `${constrainedHeight}px`
    }

    return (
        <motion.div
            ref={sheetRef}
            data-composer-sheet=""
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0}
            dragMomentum={false}
            style={{ zIndex: 350 }}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            animate={settle}
            // Same home-indicator reservation as ui/drawer.tsx. This is the
            // composer on every channel, DM, group chat and thread, so the send
            // button and toolbar sat in the OS gesture strip on every message.
            className="fixed bottom-0 left-0 border-t right-0 max-h-dvh rounded-t-3xl opacity-100 bg-background top-shadow pb-[env(safe-area-inset-bottom)]"
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
