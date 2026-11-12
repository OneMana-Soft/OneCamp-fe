// A row in a trash (docs programme B5, calendar head B): what it is (its
// mark and its name, quieter when it has none), a line about it when there is
// one, who put it there and when (TrashMeta), and its actions. The docs'
// trash and archive (RestoreRow) and the calendar's trash draw it alike.

import type * as React from "react"
import { TrashMeta, type TrashMetaProps } from "@/components/trash/TrashMeta"
import { cn } from "@/lib/utils/helpers/cn"

export interface TrashRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Its mark: a page's icon, an event's colour. */
  lead: React.ReactNode
  title: React.ReactNode
  /** It has no name of its own: the placeholder reads quieter. */
  untitled?: boolean
  /** A line about it between its name and its meta: when an event was. */
  note?: React.ReactNode
  meta: TrashMetaProps
  /** Its actions, at the row's end. */
  children?: React.ReactNode
}

export function TrashRow({ lead, title, untitled, note, meta, children, className, ...rest }: TrashRowProps) {
  return (
    <div {...rest} className={cn("flex min-h-14 items-center gap-2.5 rounded-lg px-2 py-2 sm:min-h-12", className)}>
      {lead}
      <div className="min-w-0 flex-1">
        <p className={untitled ? "truncate text-ui font-[450] text-ink-3" : "truncate text-ui font-[450] text-ink"}>{title}</p>
        {note}
        <TrashMeta {...meta} className={cn("max-sm:line-clamp-2 sm:truncate", meta.className)} />
      </div>
      {children}
    </div>
  )
}
