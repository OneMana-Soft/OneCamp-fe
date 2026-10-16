"use client"

import { memo, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { Check, Clock, Lock } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import type { EditKind, TimelineTask } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { stuckRoom } from "@/hooks/useTimelineView"

/**
 * Whether a bar holds its whole name: a 12.5px name runs about 7px a
 * character, plus the bar's padding, its cap and its icons. A bar that can't
 * has the name beside it in full, rather than cut to "Record the…" inside it.
 */
const fitsName = (name: string, width: number, icons: number) => name.length * 7 + 24 + icons * 16 <= width

/** A bar wide enough to carry its assignee's face at its end (work.md W24). */
const AVATAR_FROM = 120

/** How far in from the names column a bar's name sticks. */
export const STICK_INSET = 4

interface BarProps {
  task: TimelineTask
  left: number
  width: number
  /** Its status's hue (lib/timeline barHue): the tint, the cap and the name's ink. */
  hue: CampHue
  label: string
  /** The date bubble while it's being dragged: "Tue 14 → Fri 17 Oct". */
  bubble?: string
  /** While moved: how far it has travelled, snapped to days; it ticks from day to day. */
  shift?: number
  /** While dragged: where it was, drawn faintly so the move reads against it. */
  ghost?: { left: number; width: number } | null
  late: boolean
  /** How far past its due date today is, in pixels: the hatched tail. */
  lateTail?: number
  done: boolean
  /** A task with a due date and no start: a diamond on its day. */
  milestone?: boolean
  canEdit: boolean
  /** Where a name scrolled past the left edge stops, so a long bar keeps its name in view. */
  stickAt: number
  /** How many open tasks it waits on: a lock before its name. */
  blocked: number
  /** Start drawing a dependency from this bar to a task that waits on it. */
  onLinkStart?: (e: PointerEvent, task: TimelineTask) => void
  /** A dependency being drawn would end on this bar. */
  linkTarget?: boolean
  /** Open in the task panel. */
  selected?: boolean
  /** Just dropped or moved along: the brand-muted flash fades out. */
  landed?: boolean
  /** The first reveal's grow (useGrow), for this row. */
  grow?: { "data-grown": string; style?: CSSProperties }
  helpId?: string
  onPointerDown: (e: PointerEvent, task: TimelineTask, kind: EditKind) => void
  onKeyDown: (e: KeyboardEvent, task: TimelineTask) => void
  onClick: (task: TimelineTask) => void
  onHover?: (id: string | null) => void
}

/**
 * One task's bar (design v3, work.md W24): 24px, r6, in its status's tint
 * with a hairline and a 3px cap of the strong cut, its name sticky in the
 * hue's ink. Done is moss with a check; late grows a hatched danger tail up
 * to today. Drag it to move it (it ticks from day to day, lifted, over a
 * ghost of where it was), drag an end to change when it starts or is due;
 * arrows do the same from the keyboard. A click opens the task.
 */
export const TimelineBar = memo(function TimelineBar({
  task,
  left,
  width,
  hue,
  label,
  bubble,
  shift = 0,
  ghost,
  late,
  lateTail = 0,
  done,
  milestone = false,
  canEdit,
  stickAt,
  blocked,
  onLinkStart,
  linkTarget,
  selected,
  landed,
  grow,
  helpId,
  onPointerDown,
  onKeyDown,
  onClick,
  onHover,
}: BarProps) {
  const dragging = bubble !== undefined
  const wide = width > AVATAR_FROM
  const icons = (done ? 1 : 0) + (blocked > 0 ? 1 : 0) + (late ? 1 : 0)
  const inside = !milestone && fitsName(task.task_name, width - (wide ? 24 : 0), icons)
  const handles = canEdit && !milestone && width >= 18
  const waits = blocked > 0 ? `Waiting on ${blocked} ${blocked === 1 ? "task" : "tasks"}` : ""
  const who = task.task_assignee?.user_full_name || task.task_assignee?.user_name || ""
  const tip = [task.task_name, label, who, waits].filter(Boolean).join(" · ")
  const tail = late && lateTail > 0 && !milestone ? Math.max(6, lateTail) : 0
  // Room after the bar for the dependency handle, then the name of a short bar.
  const after = tail ? tail + 6 : canEdit && onLinkStart ? 26 : 8
  const boxLeft = milestone ? left + width / 2 - 8 : left
  const boxWidth = milestone ? 16 : width
  const style: CSSProperties = {
    left: boxLeft,
    width: boxWidth,
    transform: shift ? `translate(${shift}px, -1px)` : dragging ? "translateY(-1px)" : undefined,
    // Snapped day to day: an 80ms step between snaps, so it ticks rather than slides.
    transition: dragging ? "transform 80ms var(--ease-out)" : undefined,
    boxShadow: selected ? "0 0 0 2px var(--brand-muted)" : undefined,
    outline: selected || linkTarget ? "1.5px solid var(--brand)" : undefined,
    outlineOffset: selected || linkTarget ? "-1.5px" : undefined,
  }
  return (
    <>
      {ghost && (
        <div
          aria-hidden
          data-bar-ghost=""
          className={cn(HUE_CLASS[hue], "pointer-events-none absolute top-1.5 h-6 rounded-md bg-hue-tint opacity-30")}
          style={{ left: ghost.left, width: ghost.width }}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        data-bar={task.task_uuid}
        data-hue={hue}
        data-late={late || undefined}
        data-tip={dragging ? "" : tip}
        aria-label={`${task.task_name}, ${label}${late ? ", late" : ""}${done ? ", done" : ""}${waits ? `, ${waits.toLowerCase()}` : ""}`}
        aria-describedby={canEdit ? helpId : undefined}
        className={cn(
          HUE_CLASS[hue],
          "work-tip group/bar absolute top-1.5 flex h-6 items-center text-2xs font-[510] leading-4 text-hue-ink outline-none",
          milestone ? "justify-center" : "rounded-md",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          dragging ? "z-10 cursor-grabbing shadow-e2" : cn("hover:shadow-e1", canEdit ? "cursor-grab" : "cursor-pointer"),
        )}
        style={style}
        onPointerDown={(e) => onPointerDown(e, task, "move")}
        onPointerEnter={() => onHover?.(task.task_uuid)}
        onPointerLeave={() => onHover?.(null)}
        onKeyDown={(e) => onKeyDown(e, task)}
        onClick={() => onClick(task)}
      >
        {/* The bar itself: tint, hairline and cap, grown from its start on first reveal. */}
        {milestone ? (
          <span aria-hidden data-milestone="" data-grown={grow?.["data-grown"]} className="pointer-events-none size-3 rotate-45 rounded-[2px] bg-hue" />
        ) : (
          <span
            aria-hidden
            data-bar-fill=""
            data-grown={grow?.["data-grown"]}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-md bg-hue-tint"
            style={{ ...grow?.style, boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--hue) 30%, transparent)" }}
          >
            <span className="absolute inset-y-0 left-0 w-[3px] bg-hue" />
            {landed && <span data-landed="" className="absolute inset-0" style={{ animation: "work-landed 700ms cubic-bezier(0.25, 0.1, 0.25, 1) both" }} />}
          </span>
        )}
        {/* Late: a hatched danger tail from the due date up to today, so the bar shows how late, not just that it is. */}
        {tail > 0 && (
          <span
            aria-hidden
            data-late-tail=""
            className="pointer-events-none absolute inset-y-0 rounded-r-md"
            style={{
              left: width,
              width: tail,
              backgroundImage: "repeating-linear-gradient(45deg, color-mix(in oklab, var(--destructive) 35%, transparent) 0 2px, transparent 2px 5px)",
            }}
          />
        )}
        {handles && (
          <span
            aria-hidden
            data-resize="start"
            className="absolute inset-y-0 left-0 z-[1] flex w-1.5 cursor-ew-resize items-center justify-center"
            onPointerDown={(e) => onPointerDown(e, task, "start")}
          >
            <span className="h-2.5 w-0.5 rounded-[1px] bg-hue-ink/40 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/bar:opacity-100" />
          </span>
        )}
        {inside && (
          // It narrows to what is left of its bar in view rather than sliding
          // under the names column ("upport on the new tiers", PTC-29).
          <span className="sticky z-[1] flex min-w-0 items-center gap-1 pl-3 pr-2" style={{ left: stickAt, maxWidth: stuckRoom(left + width, STICK_INSET) }}>
            {done && <Check className="size-3 shrink-0" />}
            {late && <Clock aria-hidden className="size-3 shrink-0 text-danger-ink" />}
            {blocked > 0 && <Lock aria-hidden className="size-3 shrink-0" />}
            <span className={cn("truncate", done && "text-ink-3")}>{task.task_name}</span>
          </span>
        )}
        {inside && who && wide && (
          <span className="relative z-[1] ml-auto mr-1 shrink-0">
            <IdentityMark variant="avatar" size={18} id={avatarSeed(task.task_assignee)} label={who} />
          </span>
        )}
        {handles && (
          <span
            aria-hidden
            data-resize="end"
            className="absolute inset-y-0 right-0 z-[1] flex w-1.5 cursor-ew-resize items-center justify-center"
            onPointerDown={(e) => onPointerDown(e, task, "end")}
          >
            <span className="h-2.5 w-0.5 rounded-[1px] bg-hue-ink/40 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/bar:opacity-100" />
          </span>
        )}
        {canEdit && onLinkStart && (
          <span
            aria-hidden
            title="Drag to the task that waits on this one"
            data-link-handle=""
            className="absolute -right-5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 cursor-crosshair rounded-full border-[1.5px] border-brand bg-sheet opacity-0 transition-opacity group-hover/bar:opacity-100"
            onPointerDown={(e) => onLinkStart(e, task)}
          />
        )}
        {dragging && (
          <span
            data-date-bubble=""
            className="pointer-events-none absolute -top-8 left-0 z-20 whitespace-nowrap rounded-md bg-pop px-2 py-1 text-xs font-[510] tabular-nums text-foreground shadow-e3"
            style={{ animation: "work-pop-in 180ms var(--ease-out) both" }}
          >
            {bubble}
          </span>
        )}
      </div>
      {!inside && (
        <span
          aria-hidden
          // A done task's name is struck through in secondary text, not the
          // faint step (3.17:1, under AA): done is still read, not disabled.
          className={cn(
            "pointer-events-none absolute top-1.5 flex h-6 items-center gap-1 whitespace-nowrap text-2xs font-[510]",
            done ? "text-muted-foreground line-through" : late ? "text-danger-ink" : "text-ink-2",
          )}
          style={{ left: boxLeft + boxWidth + after, transform: shift ? `translateX(${shift}px)` : undefined }}
        >
          {late && <Clock className="size-3 shrink-0" />}
          {blocked > 0 && <Lock className="size-3 shrink-0" />}
          {task.task_name}
        </span>
      )}
    </>
  )
})
