"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * Grows a textarea with its text and shrinks it back, from its least height to
 * its max-height, past which it scrolls. It measures with no height transition
 * (one reads a stale scrollHeight), and again when its width changes. Returns
 * the measure, for an uncontrolled box.
 */
export function useGrowWithText(ref: React.RefObject<HTMLTextAreaElement | null>, value: unknown) {
  const fit = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    // Measuring collapses the box: what scrolls around it keeps its place.
    const kept: [Element, number][] = []
    for (let a = el.parentElement; a; a = a.parentElement) if (a.scrollTop) kept.push([a, a.scrollTop])
    el.style.height = "auto"
    // Empty is the least height: an empty box measures its placeholder, which a
    // panel sliding in from nothing wraps a word a line (the AI composer, 280px).
    if (el.value) el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    for (const [a, top] of kept) a.scrollTop = top
  }, [ref])
  React.useLayoutEffect(fit, [value, fit])
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, fit])
  return fit
}

/** A field for more than a line. It has no grip: it grows with its text (useGrowWithText). */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, onInput, ...props }, ref) => {
  const own = React.useRef<HTMLTextAreaElement>(null)
  React.useImperativeHandle(ref, () => own.current as HTMLTextAreaElement, [])
  const fit = useGrowWithText(own, props.value)
  return (
    <textarea
      className={cn(
        "field-surface flex min-h-[60px] w-full resize-none rounded-md px-2.5 py-2 text-base md:text-sm",
        className
      )}
      ref={own}
      onInput={
        props.value === undefined
          ? (e) => {
              fit()
              onInput?.(e)
            }
          : onInput
      }
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
