"use client"
import type * as React from "react"
import { tryAgain } from "@/components/ui/error-state"
import { SpotError } from "@/components/ui/graphics/spots"
import { cn } from "@/lib/utils/helpers/cn"
import { useSaysLoadFailure } from "@/lib/http/loadFailure"

/**
 * ErrorState in one row, for a held slot with room for a line (Who knows on
 * the search page): ErrorState's compact form stood taller than a 208px slot,
 * and its Try again fell below the fold (DESIGN-BUILD-16, 25 Oct). The words
 * wrap; Try again keeps the row's end at any width. A file of its own, so the
 * routes that draw ErrorState don't carry it.
 */
export function ErrorRow({
  subject,
  onRetry,
  retrying,
  className,
  detail,
}: {
  subject: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
  detail?: React.ReactNode
}) {
  // Said here, so the request's toast stays quiet (lib/http/loadFailure).
  useSaysLoadFailure()
  return (
    <div className={cn("flex min-w-0 items-center gap-3 [&>button]:shrink-0", className)}>
      <SpotError size={32} className="shrink-0" />
      <p className="min-w-0 flex-1 text-pretty text-meta font-medium text-ink-2">
        {`Couldn't load ${subject}`}
        {detail ? <span className="block font-normal text-ink-3">{detail}</span> : null}
      </p>
      {tryAgain(onRetry, retrying)}
    </div>
  )
}
