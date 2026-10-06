// The row a link becomes under a message: an icon tile, a title and a line of
// detail. Shared by AgentResultCards (a pull request, a branch) and
// WorkLinkCards (a task, doc or project here), which differ only in where the
// link goes, so the two can never drift into two looks.

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"

/** The card's outline; put it on the <a> or <Link> that wraps LinkCardBody. */
export const linkCardClass =
  "flex min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-card/40 px-3 py-2 transition-colors hover:border-border hover:bg-accent/40"

export function LinkCardBody({
  icon,
  iconClassName = "bg-muted text-muted-foreground",
  title,
  detail,
  detailClassName,
  trailing,
}: {
  icon: ReactNode
  iconClassName?: string
  title: ReactNode
  detail?: ReactNode
  detailClassName?: string
  trailing?: ReactNode
}) {
  return (
    <>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconClassName)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight text-foreground">{title}</span>
        {detail ? <span className={cn("block truncate text-2xs leading-tight text-muted-foreground", detailClassName)}>{detail}</span> : null}
      </span>
      {trailing}
    </>
  )
}
