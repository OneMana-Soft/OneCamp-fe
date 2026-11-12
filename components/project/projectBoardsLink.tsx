import Link from "next/link"

import { ArrowRight } from "@/lib/icons"
import { boardsHref, NO_FILTER } from "@/lib/board/boardListFilter"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A project's boards in Boards, filtered to the project (whiteboard miro-46,
 * to_win 1): the link its Attachments tab carries over the docs and boards
 * linked to it, on a computer and on a phone, once a board is among them.
 */
export function ProjectBoardsLink({ projectId, boards, className }: { projectId: string; boards: number; className?: string }) {
  if (boards === 0) return null
  return (
    <Link
      href={boardsHref({ ...NO_FILTER, project: projectId })}
      data-touch-target=""
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-sm text-ui-sm font-medium text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand", className)}
    >
      See all in Boards
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}
