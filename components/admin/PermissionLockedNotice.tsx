"use client"

import { Lock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Where a control would be when this person's role doesn't reach it (design
 * v3 §2a): the same note as the plan's lock, with a neutral tile, what is
 * off in one line and who can turn it on. Not a lone line of grey under a
 * page title with nothing below it. Its own file, so a page that only says
 * "admins only" (the Admin layout, Workflows) carries none of the plan's code.
 */
export function PermissionLockedNotice({ what, who, className }: { what: string; who: string; className?: string }) {
  return (
    <div role="note" data-permission-locked="" className={cn("flex items-start gap-3 rounded-lg bg-sunken p-4 shadow-[inset_0_0_0_1px_var(--line)]", className)}>
      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-raised text-ink-3 shadow-e1 [&>svg]:size-4">
        <Lock />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{what}</p>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{who}</p>
      </div>
    </div>
  )
}
