"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"

/**
 * A section page's body while the answers it depends on (this person's
 * permissions, whether the server has AI) are on their way: the section the
 * page will show, a title, its one line and its list's rows, under the
 * section's header, which is known at once.
 *
 * Not a spinner, which held no space and said only that something was
 * happening; not "this server runs without AI", which the AI pages said on
 * servers that have it until their config arrived; and not a bordered box of
 * rows, which the section then replaced with its own title and a second
 * skeleton, so the page jumped 90 to 190px.
 */
export function SectionLoading({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <div className="space-y-1" aria-hidden="true">
        {/* An h2's line (16px type on a 24px line), then its 20px description. */}
        <div data-section-loading-title="" className="flex h-6 items-center">
          <Skeleton className="h-4 w-28 rounded" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-full max-w-md rounded" />
        </div>
      </div>
      <SectionListSkeleton rows={rows} lines={3} trailing="switch" />
    </div>
  )
}
