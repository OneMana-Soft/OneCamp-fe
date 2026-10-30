"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { FitLabel } from "@/components/common/FitLabel"
import type { CommandListItem } from "@/components/ui/CommandList"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronDown, Globe, Plus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { zoneLabel, zoneLabels, zoneRows } from "@/lib/utils/zones"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

// The list is a chunk of its own, fetched when the trigger is pointed at or
// focused: a booking page or an event form shows the zone, and only some open it.
const loadList = () => import("@/components/ui/CommandList")
const CommandList = lazyPiece(() => loadList().then((m) => ({ default: m.CommandList })))

/**
 * A time zone, picked from a searchable list with the reader's own first: a
 * ghost button that says the zone ("Eastern Time (GMT-4)", shorter where
 * there is little room), and a list that says each zone as people know it
 * ("Eastern Time · New York", with its offset). The booking page's visitor
 * and the calendar's Event Form pick with it. `footer` sits under the list
 * (the booking page's 24-hour switch). With `adds`, the button says that in
 * place of a zone and picks one to add (Settings' "Add a time zone").
 */
export function ZonePicker({
  tz,
  onTz,
  label = "Time zone",
  adds,
  footer,
  className,
}: {
  tz: string
  onTz: (tz: string) => void
  /** What the zone is for, said with it to a screen reader: "Time zone", "Ends in". */
  label?: string
  /** What the button says when it picks a zone to add, not one to change. */
  adds?: string
  footer?: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  // Built when the list first opens, never on load.
  const named = React.useMemo(() => (open ? zoneRows() : []), [open])
  const items: CommandListItem[] = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return named
      .filter((n) => !q || n.hay.includes(q))
      .slice(0, 80)
      .map((n, i) => ({
        id: n.z,
        label: n.label,
        text: n.label,
        group: i === 0 && !q ? "Your time zone" : q ? undefined : "All time zones",
        trailing: (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-meta text-ink-3 tabular-nums">
            {n.off}
            {n.z === tz ? <Check className="size-3.5 text-ink-2" aria-hidden="true" /> : null}
          </span>
        ),
      }))
  }, [named, query, tz])
  const listRef = React.useRef<{ onKeyDown: (e: React.KeyboardEvent) => boolean } | null>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 w-full justify-start gap-1.5 px-2 text-ui-sm font-medium text-ink-2", className)}
          aria-label={adds ?? `${label}: ${zoneLabel(tz)}`}
          onPointerEnter={loadList}
          onFocus={loadList}
        >
          {adds ? (
            <>
              <Plus className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{adds}</span>
            </>
          ) : (
            <>
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              <FitLabel options={zoneLabels(tz)} />
              <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" data-tz-list="">
        <div className="border-b border-line p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (listRef.current?.onKeyDown(e)) e.preventDefault()
            }}
            placeholder="Search time zones"
            aria-label="Search time zones"
            className="h-8 w-full rounded-md bg-transparent px-2 text-ui text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <React.Suspense fallback={<div className="h-20" role="status" aria-label="Loading time zones" />}>
          <CommandList
            ref={listRef as never}
            items={items}
            label="Time zones"
            query={query}
            maxHeight={280}
            className="rounded-none border-0 shadow-none"
            empty={<p className="px-3 py-2 text-ui-sm text-ink-3">No time zone matches.</p>}
            onSelect={(it) => {
              onTz(it.id)
              setOpen(false)
              setQuery("")
            }}
          />
        </React.Suspense>
        {footer}
      </PopoverContent>
    </Popover>
  )
}
