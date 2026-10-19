"use client"

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"

import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { statusKindOf, useStatusLabel, type StatusLike } from "@/components/task/taskStatusCell"
import { celebrateTask, warmBurstsWhenIdle } from "@/lib/celebrateSoon"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { feedback } from "@/lib/ui/feedback"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The completable check (design v3, work.md W03): the task's status glyph,
 * made pressable. Clicking toggles done; Alt-click (or a long press on a
 * phone) asks for the status picker instead. Hovering an open task previews
 * completion: the ring takes a moss stroke with a ghost tick.
 *
 * The finish sequence is this control's: the press (scale .9, 90 ms), then the
 * moss disc springing in (.4 -> 1.12 -> 1, 220 ms) while the white tick draws
 * from 60 ms, and the Spark tier from its centre (lib/celebrate). The strike
 * and the row's move are its row's (TaskTitle, the grouped list). Reopening
 * swaps back with no sparks, ever. Under reduced motion the disc is simply
 * there: no data-anim, no scale, no draw, no sparks.
 */
export function TaskCheck({
  done,
  status,
  taskName,
  onToggle,
  onPicker,
  disabled = false,
  disabledReason = "Only this project's members can change it",
  size = 16,
  hit = 28,
  className,
}: {
  done: boolean
  /** The open status it shows while not done (its glyph and hue). */
  status: StatusLike
  /** For the label: "Mark Write the launch announcement complete". */
  taskName: string
  /** Called with the new state; `el` is the check, for anything that bursts from it. */
  onToggle: (done: boolean, el: HTMLElement) => void
  /** Alt-click or long press: the status picker, anchored to the check. */
  onPicker?: (el: HTMLElement) => void
  disabled?: boolean
  disabledReason?: string
  /** The glyph, in px: 16 desktop, 20 phone. */
  size?: number
  /** The hit area, in px: 28 desktop, 44 phone. */
  hit?: number
  className?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  // "fill" while this click's completion plays; "swap" while a reopen does.
  const [anim, setAnim] = useState<"fill" | "swap" | null>(null)
  const statusName = useStatusLabel(status)
  useEffect(() => {
    if (!anim) return
    const t = window.setTimeout(() => setAnim(null), 400)
    return () => window.clearTimeout(t)
  }, [anim])

  const press = useLongPress(() => ref.current && onPicker?.(ref.current))
  // The sparks are lib/celebrate's, fetched once the page is idle.
  useEffect(() => warmBurstsWhenIdle(), [])

  const click = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      e.preventDefault()
      if (press.fired()) return
      const el = e.currentTarget
      if (e.altKey && onPicker) {
        onPicker(el)
        return
      }
      if (disabled) return
      const next = !done
      if (!prefersReducedMotion()) setAnim(next ? "fill" : "swap")
      if (next) celebrateTask(el)
      onToggle(next, el)
    },
    [disabled, done, onPicker, onToggle, press],
  )

  const label = done ? `Mark ${taskName} as not done` : `Mark ${taskName} complete`
  const tip = disabled ? disabledReason : done ? "Mark as not done" : statusName ? `${statusName} · click to complete` : "Complete"
  return (
    <button
      ref={ref}
      type="button"
      data-task-check=""
      data-done={done || undefined}
      aria-label={label}
      aria-pressed={done}
      aria-disabled={disabled || undefined}
      data-tip={tip}
      onClick={click}
      onPointerDown={press.down}
      onPointerUp={press.up}
      onPointerLeave={press.up}
      className={cn(
        "work-tip group/check relative inline-flex shrink-0 items-center justify-center rounded-sm outline-none",
        "focus-visible:after:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
      style={{ width: hit, height: hit, margin: (size - hit) / 2 }}
    >
      {/* The 24px disc behind the glyph on hover, and the press. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-sm transition-colors duration-[140ms]",
          !disabled && "group-hover/check:bg-hover group-active/check:bg-press",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex transition-transform duration-[90ms] ease-out",
          !disabled && "group-active/check:scale-90",
        )}
        style={{ width: size, height: size }}
      >
        {done ? (
          <DoneGlyph size={size} animate={anim === "fill"} />
        ) : (
          <>
            <span className={cn("inline-flex", anim === "swap" && "[animation:work-glyph-in_220ms_var(--ease-spring)_both]")} data-anim={anim === "swap" ? "swap" : undefined}>
              <StatusGlyph status={statusKindOf(status)} hue={status.hue} size={size} />
            </span>
            {/* The preview of completion: moss ring and a ghost tick. */}
            {!disabled && (
              <svg
                width={size}
                height={size}
                viewBox="0 0 16 16"
                data-check-preview=""
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[140ms] group-hover/check:opacity-100"
              >
                <circle cx="8" cy="8" r="6" fill="var(--sheet)" stroke="var(--camp-moss)" strokeWidth="1.5" />
                <path d="m5.4 8.2 1.8 1.8 3.5-3.7" fill="none" stroke="var(--camp-moss)" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </>
        )}
      </span>
    </button>
  )
}

/**
 * The moss disc and its white tick. Animated, the disc springs in and the
 * tick draws after it (pathLength 1, so the dash runs the tick's length);
 * still, it is the glyph as it rests.
 */
function DoneGlyph({ size, animate }: { size: number; animate: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" data-status-glyph="done" data-anim={animate ? "fill" : undefined} className="shrink-0 overflow-visible">
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="var(--camp-moss)"
        className="transition-[fill] duration-[140ms] group-hover/check:[fill:var(--camp-moss-ink)]"
        style={animate ? { transformOrigin: "8px 8px", animation: "work-check-fill 220ms var(--ease-spring) both" } : undefined}
      />
      <path
        d="m5.2 8.2 1.9 1.9 3.8-4"
        fill="none"
        stroke="var(--sheet)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={animate ? 1 : undefined}
        style={animate ? { animation: "work-tick-draw 160ms var(--ease-out) 60ms both" } : undefined}
      />
    </svg>
  )
}

/** A long press (400 ms) on a touch screen, for the status picker; it swallows the click that follows. */
function useLongPress(onLong: () => void) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  return {
    down: (e: { pointerType: string }) => {
      fired.current = false
      if (e.pointerType !== "touch") return
      timer.current = window.setTimeout(() => {
        fired.current = true
        // A long press firing (mobile F3: impact).
        feedback("impact")
        onLong()
      }, 400)
    },
    up: () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = null
    },
    fired: () => {
      const f = fired.current
      fired.current = false
      return f
    },
  }
}

/**
 * A task's title with its strike (work.md W03, `strike`): finished, a 1 px
 * line runs under the middle of the words and the title goes ink-3. Just
 * finished by this click, the line scales in from the left over 180 ms after
 * an 80 ms beat; reopened, it leaves to the right. Done on load, it is
 * simply there.
 */
export function TaskTitle({ done, justDone, children, className }: { done: boolean; justDone?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative min-w-0 truncate transition-colors duration-[180ms]", done ? "text-ink-3" : "text-foreground", className)}>
      {children}
      {done && (
        <span
          aria-hidden="true"
          data-strike=""
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-px origin-left bg-ink-4"
          style={justDone ? { animation: "work-strike 180ms var(--ease-out) 80ms both" } : undefined}
        />
      )}
    </span>
  )
}
