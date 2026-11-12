"use client"

// "Insights for this view" (B9-b1, L32), where a task view keeps its menus:
// a Display menu's item (the boards, the timeline) and a button (the phone's
// filter sheets, the backlog). The address is lib/board/boardQuery's
// insightsHref, so every view opens its report the one way.

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { BarChart3 } from "@/lib/icons"

/** A Display menu's Insights; note says what the report can't keep of the view (its own tag filter). */
export function InsightsMenuItem({ href, note }: { href: string; note?: string }) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href} className="gap-2">
        <BarChart3 className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Insights for this view
          {note && <span className="block text-xs text-ink-3">{note}</span>}
        </span>
      </Link>
    </DropdownMenuItem>
  )
}

/** Insights as a quiet button; onClick closes the sheet it sits in. */
export function InsightsButton({ href, onClick }: { href: string; onClick?: () => void }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href} onClick={onClick}>
        <BarChart3 className="size-3.5" aria-hidden="true" />
        Insights
      </Link>
    </Button>
  )
}
