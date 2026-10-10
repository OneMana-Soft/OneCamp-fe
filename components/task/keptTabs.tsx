"use client"

// Tabs whose content stays alive once it has been seen: List, Board,
// Timeline. Going back to a tab shows it as it was, scroll and all, instead
// of building it again. A seen tab is hidden with React's Activity, which
// keeps its state and DOM, pauses its effects (no requests, no listeners)
// and renders its updates only when there's time.
//
// The panels are force-mounted, so switching never asks Radix's Presence to
// measure them: it read each panel's computed animation name on every
// switch, which forced a style recalculation of the whole page just after the
// new tab's rows had been added (28 to 85 ms at 4x CPU).

import { Activity, useCallback, useState, type ReactNode } from "react"
import { TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils/helpers/cn"

/** The tabs seen so far, the selected one always among them. */
export function useSeenTabs<T extends string>(selected: T): ReadonlySet<T> {
  const [seen, setSeen] = useState<ReadonlySet<T>>(() => new Set([selected]))
  // Selecting a tab sees it; done during render, so its content mounts in
  // the same commit as the selection.
  if (!seen.has(selected)) {
    const next = new Set(seen)
    next.add(selected)
    setSeen(next)
  }
  return seen
}

export function KeptTab({
  value,
  selected,
  seen,
  className,
  children,
}: {
  value: string
  selected: boolean
  /** Whether it has been shown before: until then it isn't built at all. */
  seen: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <TabsContent value={value} forceMount className={cn("data-[state=inactive]:hidden", className)}>
      {seen && <Activity mode={selected ? "visible" : "hidden"}>{children}</Activity>}
    </TabsContent>
  )
}

/**
 * The tab in the address, without a navigation: the Next router's replace
 * fetched the page again and rendered every component reading the address
 * (the sidebar, the header's menus) on each switch. history.replaceState is
 * synced into useSearchParams by Next itself.
 */
export function useTabInAddress() {
  return useCallback((key: string, value: string) => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (url.searchParams.get(key) === value) return
    url.searchParams.set(key, value)
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }, [])
}
