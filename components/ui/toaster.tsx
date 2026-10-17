"use client"

import * as React from "react"
import { toastDuration, useToast, useToastState, TOAST_LIMIT } from "@/hooks/use-toast"
import { escapeBelongsToLayer } from "@/hooks/useEscapeClosesPanel"
import { usePhone } from "@/hooks/usePhone"
import {
  Toast,
  ToastCard,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTile,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

/** How far apart toasts sit when the stack opens up on hover or focus. */
const EXPANDED_GAP = 10

/**
 * Collapsed, each toast behind the front one steps 10px back and 5% smaller
 * (shell T1), at .9 and then .7; past the third it is not drawn.
 */
const BEHIND_OPACITY = [1, 0.9, 0.7]

/**
 * Whether the toasts' clocks are stopped: the stack is hovered or holds
 * focus, or the window is in the background. Radix stops its own timers on
 * the same signals; this drives the timer bars and the open stack to match.
 */
function usePaused() {
  const [hover, setHover] = React.useState(false)
  const [focus, setFocus] = React.useState(false)
  const [away, setAway] = React.useState(false)
  React.useEffect(() => {
    const update = () => setAway(document.visibilityState === "hidden" || !document.hasFocus())
    const timer = window.setTimeout(update, 0)
    window.addEventListener("blur", update)
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("blur", update)
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])
  return { hover, setHover, focus, setFocus, away }
}

/**
 * Esc closes the front toast when nothing else wants the key, and one press
 * does one thing (interaction spec, rule 7: the innermost layer first). A
 * dialog, a sheet, a menu or a popover open under a toast closes first, and
 * so does the right panel: the toast waits for the next Esc. Radix made every
 * toast a layer, so a toast that came while a dialog was open (Link copied,
 * Saved a version) was the top one and took the dialog's Esc;
 * patches/@radix-ui__react-toast@1.2.15.patch takes toasts out of the layers,
 * and this is the rest of it. A toast with focus closes itself, in Radix's
 * own keydown on the toast.
 *
 * Whatever uses an Esc marks it defaultPrevented (escapeBelongsToLayer reads
 * that, and sees a layer still in the page): the layers, on the document, and
 * the right panel, on the window in the bubble phase. The panel's listener
 * comes and goes as it opens and closes, so registration order says nothing
 * about who hears a press first. So the toast's turn is lined up afresh on
 * every press: before anything hears an Esc (the window, capturing), `decide`
 * is added again to the window's bubble listeners, and a listener added then
 * is the last one that press reaches. No timer: the decision is made inside
 * the press, so a page with its clock stopped (the e2e tests) decides too.
 */
function useEscapeClosesFrontToast(frontId: string | undefined) {
  const { dismiss } = useToast()
  const front = React.useRef(frontId)
  React.useEffect(() => {
    front.current = frontId
  })
  React.useEffect(() => {
    const decide = (event: KeyboardEvent) => {
      window.removeEventListener("keydown", decide)
      const id = front.current
      if (event.key !== "Escape" || event.isComposing || !id) return
      if ((event.target as Element | null)?.closest?.(".toast-root")) return
      if (escapeBelongsToLayer(event)) return
      dismiss(id)
    }
    const lineUp = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      window.removeEventListener("keydown", decide)
      window.addEventListener("keydown", decide)
    }
    window.addEventListener("keydown", lineUp, true)
    return () => {
      window.removeEventListener("keydown", lineUp, true)
      window.removeEventListener("keydown", decide)
    }
  }, [dismiss])
}

/**
 * The toasts, stacked (design v3, shell T1). Three show; the newest is in
 * front and the others step back behind it. Pointing at the stack, or moving
 * focus into it, opens it out with 10px between toasts and pauses every
 * timer, so nobody loses an Undo while reading the toast above it.
 *
 * Each toast's card height is measured (a ResizeObserver per card), which is
 * what the open stack's offsets are made of; the motion itself is transform
 * and opacity only.
 */
export function Toaster() {
  const { toasts } = useToastState()
  const phone = usePhone()
  const { hover, setHover, focus, setFocus, away } = usePaused()
  const [heights, setHeights] = React.useState<Record<string, number>>({})
  // A closing toast keeps the place it had while open, so it fades where it was.
  const lastIndex = React.useRef<Record<string, number>>({})

  const measure = React.useCallback((id: string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }))
  }, [])

  const open = toasts.filter((t) => t.open !== false)
  useEscapeClosesFrontToast(open[0]?.id)
  const expanded = hover || focus
  const frontHeight = heights[open[0]?.id ?? ""] ?? 52

  // The open stack's offsets: each toast sits past the ones in front of it.
  const expandedOffset: Record<string, number> = {}
  let run = 0
  open.forEach((t, i) => {
    expandedOffset[t.id] = run
    run += (heights[t.id] ?? 52) + EXPANDED_GAP
    lastIndex.current[t.id] = i
  })
  const shown = Math.min(open.length, TOAST_LIMIT)
  const stackHeight = shown === 0 ? 0 : expanded ? run - EXPANDED_GAP : frontHeight + (shown - 1) * 10

  return (
    <ToastProvider swipeDirection={phone ? "down" : "right"} swipeThreshold={45}>
      {toasts.map(function ({ id, title, description, action, tone, icon, variant, duration, ...props }) {
        const isOpen = props.open !== false
        const index = isOpen ? open.findIndex((t) => t.id === id) : (lastIndex.current[id] ?? 0)
        const ms = toastDuration({ duration, action, variant, tone })
        const resolvedTone = tone ?? (variant === "destructive" ? "error" : variant === "notification" ? "info" : "success")
        const timed = !!action && Number.isFinite(ms)
        return (
          <Toast
            key={id}
            variant={variant}
            duration={ms}
            data-index={index}
            data-behind={index > 0 ? "" : undefined}
            data-tone={resolvedTone}
            style={
              {
                "--toast-i": index,
                "--toast-o": expanded ? 1 : (BEHIND_OPACITY[index] ?? 0),
                "--toast-ye": `${expandedOffset[id] ?? 0}px`,
                "--front-h": `${frontHeight}px`,
                "--toast-duration": `${Number.isFinite(ms) ? ms : 0}ms`,
              } as React.CSSProperties
            }
            {...props}
          >
            <MeasuredCard id={id} onHeight={measure}>
              <ToastTile tone={resolvedTone} icon={icon} />
              <div className="min-w-0 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
              {action}
              {timed && <i className="toast-timer" aria-hidden="true" />}
            </MeasuredCard>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport
        data-expanded={expanded ? "" : undefined}
        data-paused={expanded || away ? "" : undefined}
        style={{ height: stackHeight }}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false)
        }}
      />
    </ToastProvider>
  )
}

function MeasuredCard({ id, onHeight, children }: { id: string; onHeight: (id: string, h: number) => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    onHeight(id, el.offsetHeight || 52)
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => onHeight(id, el.offsetHeight || 52))
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, onHeight])
  return <ToastCard ref={ref}>{children}</ToastCard>
}
