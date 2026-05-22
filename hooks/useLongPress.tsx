"use client";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";

interface LongPressOptions {
    threshold?: number;
    onLongPressStart?: () => void;
    onLongPressEnd?: () => void;
    onLongPressProgress?: (progress: number) => void;
}

export function useLongPress(
    callback: () => void,
    {
        threshold = 500,
        onLongPressStart,
        onLongPressEnd,
        onLongPressProgress,
    }: LongPressOptions = {},
) {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number>(0);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const targetRef = useRef<HTMLDivElement | null>(null);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    const hasMovedRef = useRef<boolean>(false);

    const start = useCallback(
        (event: React.TouchEvent | React.MouseEvent | TouchEvent) => {
            // Store initial touch position for touch events
            if (event.type === "touchstart") {
                const touch = (event as TouchEvent).touches[0];
                const screenWidth = window.innerWidth;
                const edgeThreshold = 30; // px

                // Ignore touches near screen edges — these are system gestures
                // (iOS back swipe from right edge, Android back gesture from edges)
                if (touch.clientX < edgeThreshold || touch.clientX > screenWidth - edgeThreshold) {
                    return;
                }

                touchStartPos.current = { x: touch.clientX, y: touch.clientY };
                hasMovedRef.current = false;
            }

            onLongPressStart?.();
            startTimeRef.current = Date.now();

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }

            if (onLongPressProgress) {
                progressIntervalRef.current = setInterval(() => {
                    const elapsed = Date.now() - startTimeRef.current;
                    const progress = Math.min(elapsed / threshold, 1);
                    onLongPressProgress(progress);
                    if (progress >= 1) {
                        clearInterval(progressIntervalRef.current!);
                    }
                }, 16); // ~60fps
            }

            timeoutRef.current = setTimeout(() => {
                // Only trigger callback if touch hasn't moved significantly
                if (!hasMovedRef.current) {
                    callback();
                }
            }, threshold);
        },
        [callback, threshold, onLongPressStart, onLongPressProgress],
    );

    const move = useCallback((event: TouchEvent) => {
        if (!touchStartPos.current) return;

        const touch = event.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

        // If moved more than 20px in any direction, consider it a scroll/gesture
        if (deltaX > 20 || deltaY > 20) {
            hasMovedRef.current = true;
            stop(event);
        }
    }, []);

    const stop = useCallback(
        (event?: React.TouchEvent | React.MouseEvent | TouchEvent) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }

            touchStartPos.current = null;
            hasMovedRef.current = false;
            onLongPressEnd?.();
        },
        [onLongPressEnd],
    );

    // Attach native event listeners
    useEffect(() => {
        const element = targetRef.current;
        if (!element) return;

        const handleTouchStart = (e: TouchEvent) => start(e);
        const handleTouchMove = (e: TouchEvent) => move(e);
        const handleTouchEnd = (e: TouchEvent) => stop(e);

        element.addEventListener("touchstart", handleTouchStart, { passive: true });
        element.addEventListener("touchmove", handleTouchMove, { passive: true });
        element.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            element.removeEventListener("touchstart", handleTouchStart);
            element.removeEventListener("touchmove", handleTouchMove);
            element.removeEventListener("touchend", handleTouchEnd);
        };
    }, [start, move, stop]);

    return {
        ref: targetRef,
        onMouseDown: start,
        onMouseUp: stop,
        onMouseLeave: stop,
    };
}
