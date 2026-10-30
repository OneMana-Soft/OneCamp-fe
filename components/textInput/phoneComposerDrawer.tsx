"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import DraggableDrawer from "@/components/drawers/dragableDrawer"

/**
 * A phone's message box in its sheet (components/drawers/dragableDrawer), with
 * the conversation's command answers above it: a Giphy card, a poll, "Ran /x
 * here". The sheet's height is the answers and the box measured together, so
 * an answer grows the sheet and is in view as it comes.
 *
 * Each of the six phone boxes measured its editor alone, so the sheet was the
 * editor's height and its scroller kept the caret's line in view: the answers
 * sat scrolled out above it, and a phone never showed a Giphy card
 * (DESIGN-BUILD-10's M1, 24 Oct 2026). The sheet publishes its height
 * (--mobile-drawer-h), and the room a conversation leaves under its last
 * message follows it (phone.css, --phone-composer-room).
 *
 * The height lives here, not in the box: a new height redraws the sheet, and
 * the box's editor, a prop it already holds, isn't drawn again.
 */
export function PhoneComposerDrawer({ answers, expanded, onExpandedChange, children }: {
    answers: ReactNode
    expanded: boolean
    onExpandedChange: (expanded: boolean) => void
    children: ReactNode
}) {
    const stackRef = useRef<HTMLDivElement>(null)
    const [height, setHeight] = useState(126)
    useEffect(() => {
        const stack = stackRef.current
        if (!stack) return
        const observer = new ResizeObserver(([entry]) => {
            // What the sheet holds, plus its 12px grip strip above it.
            setHeight(Math.max(entry.contentRect.height, 30) + 12)
        })
        observer.observe(stack)
        return () => observer.disconnect()
    }, [])
    return (
        <DraggableDrawer isExpanded={expanded} setIsExpanded={onExpandedChange} initialHeight={height}>
            <div ref={stackRef}>
                {answers}
                {children}
            </div>
        </DraggableDrawer>
    )
}
