"use client";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";

interface LongPressOptions {
    threshold?: number;
    onLongPressStart?: () => void;
    onLongPressEnd?: () => void;
    onLongPressProgress?: (progress: number) => void;
}

/** A timer this late means the main thread was busy while the finger moved on. */
const LATE_MS = 50;
/** Phones follow a tap with a mousedown/mouseup for old pages; ignore those. */
const COMPAT_MOUSE_MS = 800;
/** Further than this from where it landed, a touch is a scroll, not a press. */
const MOVE_TOLERANCE_PX = 20;
/** Touches this close to a side are the system's back gesture. */
const EDGE_PX = 30;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Calls `callback` when an element is held for `threshold` ms without moving.
 *
 * On a slow phone a tap used to open the long-press menu. The press is a
 * timer started on touchstart and cancelled by touchend or touchmove; when the
 * main thread was busy (a channel rendering, 4x slower than a laptop) the
 * timer and the finger's touchend were both waiting, and the timer ran first.
 * So each press now has a token that any end, move or cancel retires, and a
 * timer that runs late lets whatever the finger did meanwhile be handled
 * first, then checks its token. touchcancel (the system taking the touch)
 * ends a press too, and the mousedown a phone sends after every tap no longer
 * starts a second one.
 */
export function useLongPress(
    callback: () => void,
    {
        threshold = 500,
        onLongPressStart,
        onLongPressEnd,
        onLongPressProgress,
    }: LongPressOptions = {},
) {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startTimeRef = useRef<number>(0);
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const targetRef = useRef<HTMLDivElement | null>(null);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    // Each press's token: a press fires only if nothing has ended it since.
    const pressRef = useRef(0);
    const lastTouchRef = useRef(-Infinity);

    const stop = useCallback(
        (event?: React.TouchEvent | React.MouseEvent | TouchEvent) => {
            if (event && event.type.startsWith("touch")) lastTouchRef.current = now();
            pressRef.current++;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            touchStartPos.current = null;
            onLongPressEnd?.();
        },
        [onLongPressEnd],
    );

    const start = useCallback(
        (event: React.TouchEvent | React.MouseEvent | TouchEvent) => {
            if (event.type === "touchstart") {
                lastTouchRef.current = now();
                const touch = (event as TouchEvent).touches?.[0];
                if (!touch) return;
                // Ignore touches near the sides: those are the system's back
                // gesture (iOS from the left, Android from either side).
                if (touch.clientX < EDGE_PX || touch.clientX > window.innerWidth - EDGE_PX) return;
                touchStartPos.current = { x: touch.clientX, y: touch.clientY };
            } else if (event.type === "mousedown" && now() - lastTouchRef.current < COMPAT_MOUSE_MS) {
                // The compatibility mousedown after a tap: not a press of its own.
                return;
            }

            const press = ++pressRef.current;
            onLongPressStart?.();
            startTimeRef.current = Date.now();
            const due = now() + threshold;

            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

            if (onLongPressProgress) {
                progressIntervalRef.current = setInterval(() => {
                    const elapsed = Date.now() - startTimeRef.current;
                    const progress = Math.min(elapsed / threshold, 1);
                    onLongPressProgress(progress);
                    if (progress >= 1 && progressIntervalRef.current) {
                        clearInterval(progressIntervalRef.current);
                    }
                }, 16); // ~60fps
            }

            const fire = () => {
                if (pressRef.current === press) callback();
            };
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                if (pressRef.current !== press) return;
                if (now() - due > LATE_MS) {
                    // Late: the finger may have lifted or moved while the page
                    // was busy, and that event is still queued behind this
                    // timer. Input runs before the next frame, so check after it.
                    requestAnimationFrame(() => setTimeout(fire, 0));
                    return;
                }
                fire();
            }, threshold);
        },
        [callback, threshold, onLongPressStart, onLongPressProgress],
    );

    const move = useCallback(
        (event: TouchEvent) => {
            const from = touchStartPos.current;
            const touch = event.touches?.[0];
            if (!from || !touch) return;
            // Moved further than a wobble: a scroll or a swipe, not a press.
            if (Math.abs(touch.clientX - from.x) > MOVE_TOLERANCE_PX || Math.abs(touch.clientY - from.y) > MOVE_TOLERANCE_PX) {
                stop(event);
            }
        },
        [stop],
    );

    // Native listeners, passive, so a press never holds up a scroll.
    useEffect(() => {
        const element = targetRef.current;
        if (!element) return;

        const handleTouchStart = (e: TouchEvent) => start(e);
        const handleTouchMove = (e: TouchEvent) => move(e);
        const handleTouchEnd = (e: TouchEvent) => stop(e);

        element.addEventListener("touchstart", handleTouchStart, { passive: true });
        element.addEventListener("touchmove", handleTouchMove, { passive: true });
        element.addEventListener("touchend", handleTouchEnd, { passive: true });
        element.addEventListener("touchcancel", handleTouchEnd, { passive: true });

        return () => {
            element.removeEventListener("touchstart", handleTouchStart);
            element.removeEventListener("touchmove", handleTouchMove);
            element.removeEventListener("touchend", handleTouchEnd);
            element.removeEventListener("touchcancel", handleTouchEnd);
        };
    }, [start, move, stop]);

    // A press still pending when the row unmounts must not fire.
    useEffect(() => () => {
        pressRef.current++;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }, []);

    return {
        ref: targetRef,
        onMouseDown: start,
        onMouseUp: stop,
        onMouseLeave: stop,
    };
}
