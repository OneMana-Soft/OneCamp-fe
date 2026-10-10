"use client"

import { SkeletonRows } from "@/components/ui/skeletonRows"

/**
 * A section page's body while the answers it depends on (this person's
 * permissions, whether the server has AI) are on their way: rows in the shape
 * of a list, under the section's header, which is known at once. Not a
 * spinner, which held no space and said only that something was happening,
 * and not "this server runs without AI", which the AI pages said on servers
 * that have it until their config arrived.
 */
export function SectionLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="rounded-lg border border-border px-4 py-3">
      <SkeletonRows rows={3} />
    </div>
  )
}
