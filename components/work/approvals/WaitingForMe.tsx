"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import { CountTick } from "@/components/ui/CountTick"
import { useWaitingApprovals } from "@/hooks/useWaitingApprovals"
import { BadgeCheck } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"

// The list comes with its first opening: My tasks' first load carries the count.
const WaitingApprovalsSheet = dynamic(() => import("@/components/work/approvals/WaitingApprovalsSheet"), { ssr: false })

/**
 * "2 to approve" in My tasks (package 9 R2b): the requests waiting for the
 * reader's answer, the ones Home's Approvals group lists. It opens them over
 * the page, a sheet on a phone, each row to its item, whose card takes the
 * answer. Nothing shows before the read answers or while nothing waits, and
 * an open list stays open when its last request is answered elsewhere.
 */
export function WaitingForMe({ className }: { className?: string }) {
  const waiting = useWaitingApprovals()
  const [open, setOpen] = useState(false)
  const count = waiting.data?.data?.items?.length ?? 0
  if (!count && !open) return null
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        data-touch-target=""
        {...ix("button")}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-brand-muted px-2.5 text-ui-sm text-brand-text",
          className,
        )}
      >
        <BadgeCheck className="size-3.5" aria-hidden />
        <span>
          <CountTick value={count} className="font-[590]" /> to approve
        </span>
      </button>
      {open ? <WaitingApprovalsSheet onClose={() => setOpen(false)} /> : null}
    </>
  )
}
