"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotCalendar, SpotImported, SpotSearch, SpotTasks } from "@/components/ui/graphics"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The one frame every view of a table draws in: Grid, Board, Calendar and
 * Chart. They were four frames. Grid, Board and Calendar opened on the rules
 * bar, Chart dropped it for its own labelled selects inside p-4 (a row about
 * 52px tall, then 16px), Calendar added a second row of its own under the
 * rules bar, the inset was 0, 12px or 16px, and only the grid scrolled inside
 * the frame while the others grew and scrolled the page, carrying the view
 * tabs out of sight. Now a switch of view changes only what is under the row.
 */

/** The toolbar row (T05): 44 px, at the top of the frame, on every view; rules as chips, actions at its end. */
export function TableToolbar({ children, end, className }: { children?: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <div data-table-toolbar="" className={cn("flex min-h-11 flex-wrap items-center gap-1 py-2 text-ui-sm", className)}>
      {children}
      {end ? <div className="ml-auto flex shrink-0 items-center gap-1.5">{end}</div> : null}
    </div>
  )
}

/**
 * The body under the row: it scrolls inside the frame, so the view tabs and
 * the toolbar stay in sight; table.css fits it to the page on a computer.
 */
export const TABLE_VIEW_BODY = "max-h-[calc(100dvh-16rem)] min-h-[8rem] overflow-auto overscroll-contain"

/**
 * Rows stacked edge to edge (a menu's, a picker's) are 44 px tall under a
 * finger: a target reaching past its row would take its neighbour's taps
 * (app/phone.css F3, which does the same for menu items).
 */
export const TOUCH_ROW = "[@media(pointer:coarse)]:h-11"

/** The inset of a view whose content sits on the frame's ground (cards, a chart). */
export const TABLE_VIEW_INSET = "p-3"

type ViewState =
  | { kind: "no-rows"; hue: CampHue }
  | { kind: "no-match"; onClear: () => void }
  | { kind: "searching" }
  | { kind: "refused"; why: string; onClear?: () => void }
  | { kind: "working"; words: string; done: number; total: number }
  | { kind: "needs-column"; column: "select" | "date"; view: string; hue: CampHue; onOpenGrid?: () => void }
  | { kind: "nothing-to-chart"; hue: CampHue }

/**
 * Every view's "nothing here" in one shape and one place: a spot, a heading
 * and at most one action, at the same padding. Board and Calendar said "Add a
 * Select column to use the board view…" as a plain centred sentence, Chart
 * said "No data to chart yet." in plain text, and the grid alone had a spot.
 */
export function TableViewState(props: ViewState) {
  const common = { className: "py-10", headingLevel: 3 as const }
  switch (props.kind) {
    case "no-rows":
      return (
        <EmptyState
          {...common}
          illustration={<SpotImported hue={props.hue} />}
          title="No rows yet"
          description="Each row is one record: a lead, an order, a task. Add the first one below."
        />
      )
    case "no-match":
      return (
        <EmptyState
          {...common}
          illustration={<SpotSearch />}
          title="No rows match these filters"
          action={
            <Button variant="outline" size="sm" onClick={props.onClear}>
              Clear filters
            </Button>
          }
        />
      )
    case "searching":
      // No hit yet among the rows read, while the rest are read: not an answer.
      return <EmptyState {...common} illustration={<SpotSearch />} title="Searching the rest of the table…" description="Rows that match show here as they're read." />
    case "refused":
      // The server wouldn't read the view (a 422, airtable-03): its own words, and the rules it can't answer to clear.
      return (
        <EmptyState
          {...common}
          illustration={<SpotSearch />}
          title={props.why}
          action={
            props.onClear ? (
              <Button variant="outline" size="sm" onClick={props.onClear}>
                Clear formula and rollup rules
              </Button>
            ) : undefined
          }
        />
      )
    case "working": {
      // The server is still filling a formula or a rollup the view reads (a 422 coded working_out, airtable-03b):
      // how far, calmly, while the view reads again by itself; never a refusal with a button to clear.
      const pct = props.total > 0 ? Math.min(100, Math.floor((props.done * 100) / props.total)) : 0
      return (
        <EmptyState
          {...common}
          title={props.words}
          description="Your view shows here the moment it's done."
          action={
            <div
              role="progressbar"
              aria-label="Worked out so far"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-1.5 w-48 overflow-hidden rounded-sm bg-line"
              data-working-progress=""
            >
              <div className="h-full origin-left rounded-sm bg-brand transition-transform duration-500" style={{ transform: `scaleX(${Math.max(pct, 4) / 100})` }} />
            </div>
          }
        />
      )
    }
    case "needs-column":
      return (
        <EmptyState
          {...common}
          // The view's own picture, not an import's tray (QA PTC-48).
          illustration={props.column === "select" ? <SpotTasks hue={props.hue} /> : <SpotCalendar hue={props.hue} />}
          title={props.column === "select" ? "A board needs a select column" : "A calendar needs a date column"}
          description={
            props.column === "select"
              ? "Each of its options becomes a column, and each row a card in it. Add one from the grid's column menu."
              : "Each row then sits on its day. Add one from the grid's column menu."
          }
          action={
            props.onOpenGrid ? (
              <Button variant="outline" size="sm" onClick={props.onOpenGrid}>
                Open the grid
              </Button>
            ) : undefined
          }
        />
      )
    case "nothing-to-chart":
      return (
        <EmptyState
          {...common}
          illustration={<SpotImported hue={props.hue} />}
          title="Nothing to chart yet"
          description="Add rows to the table and they are counted here."
        />
      )
  }
}
