"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import type { FlatItem } from "@/types/virtual"
import type { PostsRes } from "@/types/post"

interface EnhancedMessageListProps {
    items: Array<FlatItem<PostsRes>>
    renderItem: (post: PostsRes) => React.ReactNode
    getDateHeading: (date: string) => string
    className?: string
}

export const EnhancedMessageList = ({
                                        items,
                                        renderItem,
                                        getDateHeading,
                                        className = "",
                                    }: EnhancedMessageListProps) => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [startY, setStartY] = useState(0)
    const [scrollTop, setScrollTop] = useState(0)
    const [momentum, setMomentum] = useState(0)
    const [lastTouchY, setLastTouchY] = useState(0)
    const [lastTouchTime, setLastTouchTime] = useState(0)

    // Handle momentum scrolling
    useEffect(() => {
        if (!isDragging && momentum !== 0 && scrollRef.current) {
            const friction = 0.95
            const minMomentum = 0.1

            const animate = () => {
                if (Math.abs(momentum) < minMomentum) {
                    setMomentum(0)
                    return
                }

                if (scrollRef.current) {
                    scrollRef.current.scrollTop += momentum
                    setMomentum(momentum * friction)
                    requestAnimationFrame(animate)
                }
            }

            requestAnimationFrame(animate)
        }
    }, [momentum, isDragging])

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (!scrollRef.current) return

        setIsDragging(true)
        setMomentum(0)
        const touch = e.touches[0]
        setStartY(touch.clientY)
        setLastTouchY(touch.clientY)
        setLastTouchTime(Date.now())
        setScrollTop(scrollRef.current.scrollTop)
    }, [])

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isDragging || !scrollRef.current) return

            e.preventDefault()
            const touch = e.touches[0]
            const currentY = touch.clientY
            const deltaY = startY - currentY
            const currentTime = Date.now()

            // Calculate velocity for momentum
            const timeDelta = currentTime - lastTouchTime
            const yDelta = lastTouchY - currentY

            if (timeDelta > 0) {
                const velocity = yDelta / timeDelta
                setMomentum(velocity * 10) // Adjust multiplier for desired momentum
            }

            scrollRef.current.scrollTop = scrollTop + deltaY
            setLastTouchY(currentY)
            setLastTouchTime(currentTime)
        },
        [isDragging, startY, scrollTop, lastTouchY, lastTouchTime],
    )

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false)
    }, [])

    // Mouse events for desktop testing
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!scrollRef.current) return

        setIsDragging(true)
        setMomentum(0)
        setStartY(e.clientY)
        setScrollTop(scrollRef.current.scrollTop)
    }, [])

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging || !scrollRef.current) return

            e.preventDefault()
            const deltaY = startY - e.clientY
            scrollRef.current.scrollTop = scrollTop + deltaY
        },
        [isDragging, startY, scrollTop],
    )

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    return (
        <div
            ref={scrollRef}
            className={`
                h-full overflow-y-auto scrollbar-hide
                ${isDragging ? "cursor-grabbing select-none" : "cursor-grab"}
                ${className}
            `}
            style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className="gap-y-2 p-4 flex flex-col">
                {items.map((item, index) => (
                    <div key={index}>
                        {item.type === "separator" ? (
                            <div className="sticky top-0 z-[var(--z-sticky)] bg-background backdrop-blur-sm py-2 text-center text-sm text-muted-foreground border-b">
                                {getDateHeading(item.date||'')}
                            </div>
                        ) : (
                            <div
                                className="transition-transform duration-150"
                                style={{
                                    userSelect: isDragging ? "none" : "auto",
                                    pointerEvents: isDragging ? "none" : "auto",
                                }}
                            >
                                {renderItem(item.data || {} as PostsRes)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
