"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tile } from "@/components/ui/graphics/Tile"
import { BadgeCheck, Check, CircleCheck, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { relativeTime } from "@/lib/utils/relativeTime"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { displayNameOf, type PersonNameFields } from "@/lib/personName"
import { dueLabel } from "@/lib/utils/dueLabel"
import { useTaskApproval } from "@/hooks/useTaskApprovals"
import { approvalWords, approvals, type ApprovalDecision, type Verdict } from "@/lib/rules/approvals"
import type { StatusOption } from "@/lib/taskStatus"

interface Person {
  id: string
  /** As their answer is said: "Ana Ruiz", "Dana (client)". */
  name: string
  /** The name their initials come from, when it isn't `name`. */
  face?: string
}

/** A member of the task's project, as the task panel reads them. */
type Member = PersonNameFields & { user_uuid: string }

/**
 * An answer's mark: the face badge the inbox uses (hub-kind-badge), 14px with
 * a ring in the card's surface: a check on moss for approved, an x on berry
 * for changes or a rejection, nothing while they haven't answered.
 */
function AnswerMark({ decision, inline }: { decision?: ApprovalDecision; inline?: boolean }) {
  if (!decision) return null
  const yes = decision.verdict === "approve"
  return (
    <span
      aria-hidden="true"
      data-answer-mark={decision.verdict}
      className={cn(
        "hub-kind-badge size-3.5 [box-shadow:0_0_0_2px_var(--sunken)] [&_svg]:size-2.5",
        inline ? "!static mt-0.5 shrink-0" : "-bottom-0.5 -right-0.5",
        yes ? "bg-camp-moss-tint text-camp-moss-ink" : "bg-camp-berry-tint text-camp-berry-ink",
      )}
    >
      {yes ? <Check /> : <X />}
    </span>
  )
}

const ANSWERED: Record<string, string> = { approve: "approved", changes: "asked for changes", reject: "rejected" }

/** What an answer says, for a face's tooltip: "maya approved · 38m ago". */
function answered(name: string, d?: ApprovalDecision) {
  if (!d) return `${name} hasn't answered`
  const when = relativeTime(d.decided_at)
  return when ? `${name} ${ANSWERED[d.verdict]} · ${when}` : `${name} ${ANSWERED[d.verdict]}`
}

/** One approver: their face, and their answer's mark. */
function Approver({ person, decision }: { person: Person; decision?: ApprovalDecision }) {
  const words = answered(person.name, decision)
  return (
    <li className="relative" title={words}>
      <span className="sr-only">{words}</span>
      <Avatar className={cn("size-7 ring-2 ring-sunken transition-opacity duration-200", !decision && "opacity-70")}>
        <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(person.face ?? person.name))}>{getNameInitials(person.face ?? person.name).slice(0, 2)}</AvatarFallback>
      </Avatar>
      <AnswerMark decision={decision} />
    </li>
  )
}

/** The client as their answer is said: "Dana (client)", or "The client" before they answer. */
const clientName = (d?: ApprovalDecision) => (d?.name ? `${d.name} (client)` : "The client")

/**
 * A task's approval (package 9 R2, R2b), in its panel: where a held move
 * waits to go, or what the asker asks about the task itself and by when; who
 * has answered, the client among them when the request wants their yes; and,
 * for an approver, Approve, Ask for changes and Reject, each saying why in a
 * word or two (asking for changes needs them). The answer is also written on
 * the task, so its history says who decided. A held move the task went on
 * without says it closed, and where the task is now (status). Nothing shows
 * when the task has never been sent for approval. The task panel loads it as
 * a chunk of its own (its default export), so the task page's first screen
 * doesn't carry it.
 */
export default function TaskApprovalCard({ taskUUID, members, status }: { taskUUID: string; members: Member[]; status?: Pick<StatusOption, "value" | "label"> }) {
  const { approval, decide, withdraw, refresh } = useTaskApproval(taskUUID)
  const [asking, setAsking] = useState<Verdict | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  // The task moved, here or by someone else: a held move it waited on may
  // have closed, so read the request again. Not on the first status: the
  // request's own read is in flight.
  const at = status?.value
  const lastAt = useRef(at)
  useEffect(() => {
    const before = lastAt.current
    lastAt.current = at
    if (before && at && before !== at) void refresh()
  }, [at, refresh])
  if (!approval) return null
  const name = (id: string) => {
    const m = members.find((x) => x.user_uuid === id)
    return (m && displayNameOf(m)) || (m ? "A member" : "A former member")
  }
  const said = (d: ApprovalDecision) => (d.client ? clientName(d) : name(d.user_id))
  const pending = approval.state === "pending"
  const done = approvals(approval)
  const clientSaid = approval.decisions.find((d) => d.client)
  const due = pending && approval.due_at ? dueLabel(approval.due_at, new Date()) : ""
  const late = !!due && Date.parse(approval.due_at!) < Date.now()
  const answer = async (verdict: Verdict) => {
    if (verdict !== "approve" && asking !== verdict) {
      setAsking(verdict)
      return
    }
    setBusy(true)
    try {
      const after = await decide(approval.id, verdict, note)
      setAsking(null)
      setNote("")
      toast({ title: after.state === "approved" && after.to_status ? `Approved: it moves to ${after.to_name}` : verdict === "approve" ? "Approved" : verdict === "changes" ? "Changes asked for" : "Rejected" })
    } catch (e) {
      toast({ title: "Couldn't send your answer", description: apiErrorMessage(e), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section data-task-approval={approval.state} aria-label="Approval" className="mb-3 rounded-xl bg-sunken p-3">
      <div className="flex items-start gap-3">
        {/* Berry only for a no: a withdrawal or a move on closed it without one. */}
        <Tile hue={pending ? "sun" : approval.state === "approved" ? "moss" : approval.state === "withdrawn" || approval.state === "moved_on" ? "ink" : "berry"} size="md">
          <BadgeCheck />
        </Tile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{approvalWords(approval, status)}</p>
          <p className="text-meta text-ink-3">
            {`${name(approval.requested_by)} ${approval.to_status ? `asked to move it to ${approval.to_name}` : "asked for approval"} · ${relativeTime(approval.created_at)}`}
          </p>
          {approval.ask && <p className="mt-1.5 whitespace-pre-wrap break-words border-l-2 border-line pl-2 text-sm text-ink-2">{approval.ask}</p>}
          {due && <p className={cn("mt-1 text-meta font-medium", late ? "text-danger-ink" : "text-ink-2")}>{due}</p>}
          {pending && approval.needed > 1 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-press" role="progressbar" aria-valuemin={0} aria-valuemax={approval.needed} aria-valuenow={done} aria-label="Approvals">
              <div className="h-full origin-left rounded-sm bg-success transition-transform duration-200" style={{ transform: `scaleX(${Math.min(1, done / approval.needed)})` }} />
            </div>
          )}
          <ul className="mt-2 flex -space-x-1.5" aria-label="Approvers">
            {approval.approvers.map((id) => (
              <Approver key={id} person={{ id, name: name(id) }} decision={approval.decisions.find((d) => !d.client && d.user_id === id)} />
            ))}
            {approval.client && <Approver key="client" person={{ id: "client", name: clientName(clientSaid), face: clientSaid?.name || "Client" }} decision={clientSaid} />}
          </ul>
          {approval.decisions.filter((d) => d.comment).slice(-2).map((d) => (
            <p key={d.client ? "client" : d.user_id} className="mt-2 flex items-start gap-1.5 text-xs text-ink-2" title={answered(said(d), d)}>
              <AnswerMark decision={d} inline />
              <span><span className="font-medium text-ink">{said(d)}</span> {d.comment}</span>
            </p>
          ))}
        </div>
      </div>
      {pending && approval.can_decide && (
        <div className="mt-3 space-y-2">
          {asking && (
            <Textarea autoFocus aria-label={asking === "changes" ? "What needs to change" : "Why"} rows={2} maxLength={2000} value={note}
              placeholder={asking === "changes" ? "What needs to change" : "Why (optional)"} onChange={(e) => setNote(e.target.value)} className="text-sm" />
          )}
          {asking ? (
            // Writing changes or a rejection: one primary, and a way back.
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={asking === "reject" ? "destructive" : "default"} className="h-11 md:h-8"
                disabled={asking === "changes" && !note.trim()} busy={busy} onClick={() => void answer(asking)}>
                {asking === "changes" ? "Send" : "Reject it"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-11 md:h-8" disabled={busy} onClick={() => { setAsking(null); setNote("") }}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="h-11 gap-1.5 md:h-8" busy={busy} onClick={() => void answer("approve")}>
                <CircleCheck className="size-4" /> Approve
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-11 md:h-8" disabled={busy} onClick={() => void answer("changes")}>
                Ask for changes
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-11 text-danger md:h-8" disabled={busy} onClick={() => void answer("reject")}>
                Reject
              </Button>
            </div>
          )}
        </div>
      )}
      {pending && approval.can_withdraw && !approval.can_decide && (
        <Button type="button" size="sm" variant="ghost" className="mt-2 h-11 text-ink-2 md:h-8" disabled={busy}
          onClick={() => void withdraw().catch((e) => toast({ title: "Couldn't withdraw it", description: apiErrorMessage(e), variant: "destructive" }))}>
          Withdraw the request
        </Button>
      )}
    </section>
  )
}
