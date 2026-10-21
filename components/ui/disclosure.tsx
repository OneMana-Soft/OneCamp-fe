"use client"

import * as React from "react"
import { ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** A line that opens what's under it, with the app's turning chevron, not the browser's triangle; 44px on touch. */
export function Disclosure({
  summary,
  children,
  className,
  summaryClassName,
  summaryTitle,
  chevron = true,
  ...rest
}: Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, "children"> & {
  summary: React.ReactNode
  children: React.ReactNode
  summaryClassName?: string
  summaryTitle?: string
  /** False for a summary drawn its own way. */
  chevron?: boolean
}) {
  return (
    <details className={cn("group", className)} {...rest}>
      <summary
        title={summaryTitle}
        className={cn(
          "flex cursor-pointer select-none list-none items-center gap-1.5 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden",
          summaryClassName,
        )}
      >
        {chevron && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3 transition-transform duration-[140ms] ease-out group-open:rotate-90" />}
        {summary}
      </summary>
      {children}
    </details>
  )
}
