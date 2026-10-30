"use client"

import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { HubRow } from "@/components/ui/hubRow"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { approvalsToNeeds } from "@/components/home/needsMe"
import { NeedsLead, NeedsSecond } from "@/components/home/needsRow"
import { useWaitingApprovals } from "@/hooks/useWaitingApprovals"

/**
 * The requests waiting for the reader's answer, opened from My tasks' "N to
 * approve": Home's approval rows (components/home/needsRow), each opening its
 * item, whose card takes the answer. It follows the shared read, so a request
 * answered elsewhere leaves it.
 */
export default function WaitingApprovalsSheet({ onClose }: { onClose: () => void }) {
  const waiting = useWaitingApprovals()
  const [now] = useState(() => new Date())
  const items = waiting.data?.data?.items ?? []
  const rows = approvalsToNeeds(items, now)
  return (
    <ResponsiveDialog
      title="Waiting for my approval"
      description="Open one to answer it on its card."
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p role="status" className="py-6 text-center text-ui text-ink-2">
          Nothing waits for your answer now.
        </p>
      ) : (
        <ul className="-mx-2.5" data-waiting-list="">
          {rows.map((row) => (
            <HubRow
              key={row.id}
              as="li"
              // Opens through its title, stretched over the row (SH-32).
              opens
              density="two-line"
              clamp
              data-needs-kind={row.kind}
              lead={<NeedsLead item={row} />}
              title={
                <Link
                  href={row.href}
                  onClick={onClose}
                  className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand"
                >
                  {row.title}
                </Link>
              }
              second={<NeedsSecond item={row} />}
            />
          ))}
        </ul>
      )}
    </ResponsiveDialog>
  )
}
