"use client"

import * as React from "react"
import { Tile } from "@/components/ui/graphics/Tile"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The plan's notes, one look (design v3, admin §1.7): a note, not a control,
 * so it sits on --sunken with an inset ring and no elevation, beside a sun
 * tile. A locked company control (PlanLockedNotice) and the seat limit
 * (SeatLimitNote) both wear it, so the plan reads the same wherever it is met.
 */
export function PlanNote({
  icon,
  compact = false,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { icon: React.ReactNode; compact?: boolean }) {
  return (
    <div {...rest} className={cn("flex items-start gap-3 rounded-lg bg-sunken shadow-[inset_0_0_0_1px_var(--line)]", compact ? "p-3" : "p-4", className)}>
      <Tile hue="sun" size={compact ? "sm" : "md"} className={compact ? undefined : "rounded-[9px]"}>
        {icon}
      </Tile>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
