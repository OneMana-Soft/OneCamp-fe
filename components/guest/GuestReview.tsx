"use client"

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { DueLabel, dueDateOf } from "@/components/task/DueLabel"
import { dueByWords } from "@/components/task/dueByWords"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { celebrateTask, warmBurstsWhenIdle } from "@/lib/celebrateSoon"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { AlertCircle, BadgeCheck, Check, MessageSquare } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { CHIP_TONE } from "@/lib/ui/chipTone"
import type { GuestAsk } from "@/lib/rules/approvals"
import type { GuestReview as Review, GuestTaskCard } from "@/services/guestService"

/**
 * What a client does with a task that waits on them (design v3, work.md
 * W51): a card in the board's anatomy (W21), and in its foot "Approve" and
 * "Ask for changes". Approving springs a moss badge in (check-fill) with one
 * Spark from it: an outsider finishing something deserves it, once.
 */

/**
 * Whether a task waits on the client's verdict: the team asked this link for
 * it (package 9 R2b), or it is in review with none given yet.
 */
export function awaitsReview(t: Pick<GuestTaskCard, "status" | "review" | "waiting">): boolean {
  return !!t.waiting || (t.status === "inReview" && !t.review)
}

/**
 * What the team asks the client to approve (package 9 R2b): by when (one
 * phrase), their words or where a held move goes, and who asked. On a card,
 * two lines of words at most; in the task's panel, whole.
 */
export function GuestAskNote({ ask, compact = false }: { ask: GuestAsk; compact?: boolean }) {
  const words = ask.ask || (ask.to_label ? `Approving moves it to ${ask.to_label}.` : "")
  const due = dueDateOf(ask.due_at)
  return (
    <div data-guest-ask="" className={cn("grid gap-1", !compact && "rounded-md border p-3")}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-micro">
        <span className={cn("inline-flex h-5 items-center gap-1 rounded-sm px-1.5 font-medium", CHIP_TONE.sun)}>
          <BadgeCheck className="size-3" aria-hidden="true" />
          Waiting for your approval
        </span>
        {due ? (
          <span data-ask-due="" className={cn("whitespace-nowrap text-2xs tabular-nums", due.getTime() < Date.now() ? "text-danger-ink" : "text-ink-2")}>
            {dueByWords(due)}
          </span>
        ) : null}
      </p>
      {words ? <p className={cn("break-words text-ui-sm text-foreground", compact && "line-clamp-2")}>{words}</p> : null}
      <p className="text-micro text-ink-3">Asked by {ask.asked_by}</p>
    </div>
  )
}

/**
 * The verdict as a 20 px chip: moss with a check, or sun with "!" (work.md W21).
 * In a card's row beside the due date, the comments and the assignee it
 * shrinks before anything spills: the client's name gives way, the verdict
 * stays whole. It kept its words' width and pushed the assignee out past the
 * card's edge ("Changes requested · Priya (Acme)" in a 264px column).
 */
export function VerdictChip({ review, animate = false }: { review: Review; animate?: boolean }) {
  const approved = review.decision === "approved"
  return (
    <span
      data-verdict={review.decision}
      className={cn(
        "inline-flex h-5 min-w-0 max-w-full items-center gap-1 rounded-sm px-1.5 text-micro font-medium",
        approved ? "bg-camp-moss-tint text-camp-moss-ink" : "bg-camp-sun-tint text-camp-sun-ink",
      )}
      title={`${approved ? "Approved" : "Changes requested"} by ${review.name}`}
    >
      {approved ? (
        <Check className="size-3 shrink-0" aria-hidden="true" style={animate ? { animation: "work-check-fill 220ms var(--ease-spring) both" } : undefined} />
      ) : (
        <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
      )}
      <span className="shrink-0">{approved ? "Approved" : "Changes requested"}</span>
      <span data-verdict-by="" className="min-w-0 truncate">· {review.name}</span>
    </span>
  )
}

const STATUS_KIND: Record<string, "backlog" | "todo" | "progress" | "review" | "done" | "cancelled"> = {
  backlog: "backlog",
  todo: "todo",
  inProgress: "progress",
  inReview: "review",
  done: "done",
  canceled: "cancelled",
}

/** A guest board's column glyph, from the column's built-in status. */
export function GuestStatusGlyph({ status, size = 16 }: { status: string; size?: number }) {
  return <StatusGlyph status={STATUS_KIND[status] ?? "todo"} size={size} />
}

/**
 * A client's task card: the board card's material (raised, e1, r10, padding
 * 12), the title at 510, then the due label, the comment count and the
 * assignee's avatar; a verdict chip once given, what the team asks while it
 * waits for them, and the verdict buttons while one is awaited (and the guest
 * has said who they are).
 */
export function GuestCard({
  task,
  opened,
  showComments,
  canReview,
  onOpen,
  onReview,
}: {
  task: GuestTaskCard
  opened: boolean
  showComments: boolean
  /** The guest may give verdicts (comments are on) and has a name to give them under. */
  canReview: boolean
  onOpen: () => void
  /** Approves, or asks to open the task for a note; resolves with an error to show, or null. */
  onReview: (decision: "approved", el: HTMLElement) => Promise<string | null>
}) {
  const done = task.status === "done"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [justApproved, setJustApproved] = useState(false)
  // A finish's sparks are lib/celebrate's, fetched once the page is idle.
  useEffect(() => warmBurstsWhenIdle(), [])
  const waiting = awaitsReview(task)
  return (
    <div
      data-guest-card=""
      className={cn(
        "relative rounded-[10px] bg-raised p-3 shadow-e1 transition-[translate] duration-[140ms] hover:-translate-y-px",
        opened && "bg-[color-mix(in_oklab,var(--brand-muted)_40%,var(--raised))] ring-[1.5px] ring-inset ring-brand",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={opened ? "true" : undefined}
        className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="sr-only">{task.name}</span>
        <p aria-hidden="true" className={cn("line-clamp-2 break-words text-ui font-[510]", done ? "text-ink-3" : "text-foreground")}>
          {task.name}
        </p>
        <span className="mt-2 flex min-h-[22px] items-center gap-2 text-xs text-ink-3">
          {task.due_date && <DueLabel date={task.due_date} done={done} variant="card" />}
          {showComments && task.comment_count > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageSquare className="size-3" aria-hidden="true" />
              {task.comment_count}
            </span>
          )}
          {task.review && <VerdictChip review={task.review} animate={justApproved} />}
          <span className="flex-1" />
          {task.assignee && <IdentityMark variant="avatar" id={avatarSeed(task.assignee)} label={task.assignee} size={22} aria-label={task.assignee} />}
        </span>
      </button>
      {task.waiting ? (
        <div className="mt-2">
          <GuestAskNote ask={task.waiting} compact />
        </div>
      ) : null}
      {waiting && canReview && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={async (e) => {
              const el = e.currentTarget
              setBusy(true)
              setError("")
              const err = await onReview("approved", el)
              setBusy(false)
              if (err) setError(err)
              else {
                if (!prefersReducedMotion()) setJustApproved(true)
                celebrateTask(el)
              }
            }}
          >
            <Check className="size-3.5 text-camp-moss" />
            Approve
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={onOpen}>
            Ask for changes
          </Button>
          {error && (
            <p role="alert" className="w-full text-xs text-danger-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
