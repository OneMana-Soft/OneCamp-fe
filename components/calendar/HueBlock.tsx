"use client"

import * as React from "react"

import { Moon, Plane } from "@/lib/icons"
import { StatusGlyph, type StatusKind } from "@/components/ui/graphics"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"

import { hueOf, kindOf, type CalendarItemLike } from "./calendarTones"

/**
 * An event drawn on time (content.md §1.4, §1.5): month bars, week and day
 * blocks, all-day chips, the more popover's rows and the agenda's edge.
 *
 * - An event takes its calendar's hue (a task its project's): a 3 px bar of
 *   the strong cut on the leading edge, and the tint mixed 60 % into the sheet,
 *   with the title in the hue's ink.
 * - Past events drop to a quieter fill with ink-2 text; a live one (now
 *   inside it) fills fully with a 1 px ring of the hue; a selected one (its
 *   popover open) gets a 1.5 px hue ring and lifts.
 * - Focus time is never a hue: sunken, a 135° hatch of --line-2, an ink-3
 *   bar and a moon. It says "nobody should book this" without competing.
 * - Away is a dashed outline on nothing, with a plane.
 *
 * The fill strength is one variable (--fill), so hover, past, live and the
 * month's quiet timed bars are one rule each.
 */
export type HueBlockVariant = "bar" | "block" | "chip" | "row"

export interface HueBlockProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  item: CalendarItemLike & { task_status?: string }
  variant: HueBlockVariant
  past?: boolean
  live?: boolean
  selected?: boolean
  /** A timed event in the month: the fill at 35 %, so all-day bars lead. */
  quiet?: boolean
  /** The bar is a continuation (a multi-day bar's later weeks): no leading bar. */
  continued?: boolean
  /** Render as a div (draggable shells) instead of a button. */
  as?: "button" | "div"
  children?: React.ReactNode
}

/** The task status glyph for a task's category. */
export function taskGlyphStatus(status: string | undefined): StatusKind {
  switch ((status || "").toLowerCase()) {
    case "done":
    case "completed":
      return "done"
    case "inprogress":
    case "in_progress":
    case "in progress":
      return "progress"
    case "inreview":
    case "in_review":
    case "review":
      return "review"
    case "canceled":
    case "cancelled":
      return "cancelled"
    case "backlog":
      return "backlog"
    default:
      return "todo"
  }
}

/** The classes a block is drawn with (also used by the drag ghost and tests). Pure. */
export function hueBlockClasses(item: CalendarItemLike, { past, live, selected, quiet }: { past?: boolean; live?: boolean; selected?: boolean; quiet?: boolean } = {}): string {
  const kind = kindOf(item)
  if (kind === "away") {
    return cn("border border-dashed border-line-3 bg-transparent text-ink-3", past && "opacity-55")
  }
  if (kind === "focus") {
    return cn("focus-hatch text-ink-2", past && "opacity-55", selected && "ring-[1.5px] ring-ink-3 shadow-e2")
  }
  return cn(
    HUE_CLASS[hueOf(item)],
    "bg-[color-mix(in_oklab,var(--hue-tint)_var(--fill),var(--sheet))] text-hue-ink transition-[box-shadow,opacity] duration-[140ms]",
    quiet ? "[--fill:35%] hover:[--fill:60%]" : "[--fill:60%] hover:[--fill:80%]",
    past && "[--fill:33%] text-ink-2 hover:[--fill:45%]",
    live && "[--fill:100%] ring-1 ring-inset ring-hue/35",
    selected && "ring-[1.5px] ring-hue shadow-e2",
  )
}

/**
 * Where a lifted block or bar was, while it moves (INTERACTION_SPEC §2.5's
 * placeholder): its own box, emptied, with a dashed line-3 outline inside it
 * and its hue at 4 %. The week's and the month's drags draw it alike. Pure.
 */
export function dragPlaceholderClasses(item: CalendarItemLike): string {
  return cn(
    HUE_CLASS[hueOf(item)],
    "bg-[color-mix(in_oklab,var(--hue-tint)_4%,transparent)] shadow-none outline-[1.5px] outline-dashed outline-line-3 outline-offset-[-1.5px] [&>*]:invisible",
  )
}

export const HueBlock = React.forwardRef<HTMLElement, HueBlockProps>(function HueBlock(
  { item, variant, past, live, selected, quiet, continued, as = "button", className, children, ...rest },
  ref,
) {
  const kind = kindOf(item)
  const Comp = as as "button"
  const lead =
    kind === "task" ? (
      <StatusGlyph status={taskGlyphStatus(item.task_status)} size={12} className="shrink-0" />
    ) : kind === "focus" ? (
      <Moon className="size-3 shrink-0" aria-hidden="true" />
    ) : kind === "away" ? (
      <Plane className="size-3 shrink-0" aria-hidden="true" />
    ) : null
  const bar = kind === "event" || kind === "focus"
  return (
    <Comp
      ref={ref as React.Ref<HTMLButtonElement>}
      type={as === "button" ? "button" : undefined}
      data-hue-block={kind}
      // Which item it is, for the calendar's keys and its menu (E, Delete, a right-click).
      data-event-uuid={item.event_uuid}
      data-hue={kind === "event" || kind === "task" ? hueOf(item) : undefined}
      data-past={past || undefined}
      data-live={live || undefined}
      data-selected={selected || undefined}
      className={cn(
        "group/hb relative flex min-w-0 select-none overflow-hidden rounded-md text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
        variant === "bar" && "h-[22px] items-center gap-1 pr-1.5 text-meta font-medium",
        variant === "chip" && "h-[22px] items-center gap-1 pr-1.5 text-meta font-medium",
        variant === "row" && "h-8 items-center gap-2 pr-2 text-ui-sm font-medium",
        variant === "block" && "flex-col items-stretch pr-1.5 text-meta font-medium",
        bar && !continued ? "pl-[9px]" : "pl-1.5",
        hueBlockClasses(item, { past, live, selected, quiet }),
        className,
      )}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {bar && !continued ? (
        <span aria-hidden="true" data-hue-bar="" className={cn("absolute inset-y-0 left-0 w-[3px]", kind === "focus" ? "bg-ink-3" : "bg-hue")} />
      ) : null}
      {variant !== "block" ? lead : null}
      {variant === "block" && lead ? <span className="absolute right-1 top-1 opacity-80">{lead}</span> : null}
      {children}
    </Comp>
  )
})
