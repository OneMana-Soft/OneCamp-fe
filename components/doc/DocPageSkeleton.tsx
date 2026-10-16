"use client"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * The doc page while it loads (content.md D04): the same frame as the page it
 * becomes, so nothing jumps sideways. A 52 px header with two bars, then the
 * 720 px reading column: a 32 px title bar at 60 %, then five text bars at the
 * 16/26 rhythm. Static at first; the bars breathe only after 400 ms, so a fast
 * load never flashes.
 */
const BAR = "rounded-md bg-press [animation:skeleton-breathe_1.8s_ease-in-out_400ms_infinite]"

export function DocBodySkeleton({ className }: { className?: string }) {
  return (
    <div data-doc-skeleton="" className={cn("doc-measure mx-auto w-full px-5 pt-6 md:px-8 md:pt-14", className)}>
      <div className={cn(BAR, "h-12 w-[60%] max-md:h-9")} />
      <div className={cn(BAR, "mt-3 h-3 w-48")} />
      <div className="mt-8 space-y-[14px]">
        {[92, 100, 84, 96, 40].map((w) => (
          <div key={w} className={cn(BAR, "h-3")} style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

export function DocPageSkeleton() {
  return (
    <div className="flex h-full flex-col bg-sheet" aria-busy="true" aria-label="Opening the doc">
      <div className="hidden h-[52px] shrink-0 items-center justify-between pl-5 pr-3 md:flex">
        <div className="flex items-center gap-2">
          <div className={cn(BAR, "h-3 w-10")} />
          <div className={cn(BAR, "h-3 w-[120px]")} />
        </div>
        <div className={cn(BAR, "h-7 w-[72px]")} />
      </div>
      <DocBodySkeleton />
    </div>
  )
}
