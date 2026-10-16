"use client"

import * as React from "react"
import { PlusCircledIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * One filter's button, the same in every task list and board: "+ Status"
 * while it filters nothing, "Status: In progress, QA" (or "Status: 3") once it
 * does. Each list used to draw its own: a dashed box, a divider and a grey
 * badge per value, an icon with a margin in some and none in others, and two
 * of them printed the stored status key instead of its name.
 *
 * It is the trigger a Popover opens from, so it forwards its ref and props.
 */
export const FilterChip = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { title: string; selected?: string[]; count?: number }
>(function FilterChip({ title, selected = [], count, className, ...props }, ref) {
  const n = count ?? selected.length
  const summary = selected.length > 0 && selected.length <= 2 ? selected.join(", ") : n > 0 ? String(n) : ""
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      className={cn(
        // Design v3 (work.md W10): a quiet ghost while it filters nothing, a
        // chip on the hover ground inside a hairline once it does; never a
        // bordered button in a toolbar. 28px tall, it takes a touch 44px tall
        // (extend-touch-target): a phone's board had three of them under 44.
        "extend-touch-target h-7 max-w-[18rem] gap-1.5 px-2.5 text-xs font-[510]",
        n > 0 ? "bg-hover text-foreground ring-line" : "text-ink-2 hover:text-foreground",
        className,
      )}
      {...props}
    >
      {n === 0 && <PlusCircledIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="shrink-0">{n > 0 ? `${title}:` : title}</span>
      {n > 0 && <span className="min-w-0 truncate font-normal">{summary}</span>}
    </Button>
  )
})
