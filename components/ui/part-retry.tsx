"use client"

import { RefreshCw } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A part of a screen whose code couldn't come (lib/lazy/lazyPart's failed),
 * said in its own room: what it is, and Try again. A narrow column (the task
 * panel's rail) wraps it to a second line rather than cutting it, so Try again
 * always shows. The rest of the screen carries on, and the part tries again
 * by itself once the browser is back online.
 */
export function PartRetry({ what, retry, className }: { what: string; retry: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={retry}
      data-part-failed=""
      title="Check your connection, then try again."
      className={cn("inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-meta text-ink-2 hover:bg-hover hover:text-ink md:min-h-7", className)}
    >
      <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {`Couldn't load ${what}. `}
        <span className="whitespace-nowrap">Try again</span>
      </span>
    </button>
  )
}
