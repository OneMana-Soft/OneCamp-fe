"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { DateField, TimeField } from "@/components/ui/date-field"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { useTaskApproval } from "@/hooks/useTaskApprovals"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { displayNameOf } from "@/lib/personName"
import { localDay } from "@/lib/utils/timeZone"
import { MAX_ASK } from "@/lib/rules/approvals"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoRawInterface } from "@/types/task"
import type { UserProfileInterface } from "@/types/user"
import { ApprovalsNeeded, ClientToo, PeopleChips, neededFor } from "@/components/work/approvals/approverPicks"

/** The end of a working day: a due date picked without a time is due then. */
const DEFAULT_TIME = "17:00"

/** The moment a request is due, from the picked day and time in the asker's own zone; none without a day. */
export function dueAtOf(day: string, time: string): string | null {
  if (!day) return null
  const at = new Date(`${day}T${time || DEFAULT_TIME}`)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/**
 * "Ask for approval" on a task (package 9 R2b): who approves it and how many
 * of them must, whether the client must too, by when, and what is asked. A
 * dialog on a computer and the shared sheet on a phone, Ask pinned in its
 * footer. The task's card shows the request the moment it is made, and the
 * server's words say why when it can't be (no client link, a private task,
 * an approver who can't see it). Opened by the task's menu and the phone's
 * task drawer (uiSlice askApproval), and loaded only then.
 */
export default function AskApprovalSheet({ taskUUID, onClose }: { taskUUID: string; onClose: () => void }) {
  const info = useFetch<TaskInfoRawInterface>(`${GetEndpointUrl.GetTaskInfo}/${taskUUID}`, undefined, undefined, OWN_ERRORS)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const { approval, ask } = useTaskApproval(taskUUID)
  const { toast } = useToast()
  const [approvers, setApprovers] = useState<string[]>([])
  const [needed, setNeeded] = useState(1)
  const [client, setClient] = useState(false)
  const [day, setDay] = useState("")
  const [time, setTime] = useState(DEFAULT_TIME)
  const [words, setWords] = useState("")
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState("")

  const me = self.data?.data?.user_uuid
  // Who can approve: the project's people, not the asker, and no agent: an
  // approval is answered in the app, never through a token.
  const people = (info.data?.data.task_project?.project_members ?? [])
    .filter((m) => m.user_uuid !== me && !m.is_bot)
    .map((m) => ({ id: m.user_uuid, name: displayNameOf(m) || "A member" }))
  const waiting = approval?.state === "pending"
  const tooLong = words.length > MAX_ASK
  const canAsk = !waiting && !busy && !tooLong && (approvers.length > 0 || client)

  const send = async () => {
    setBusy(true)
    setRefused("")
    try {
      await ask({ approvers, needed: approvers.length ? needed : 0, client, due_at: dueAtOf(day, time), ask: words.trim() })
      toast({ title: "Asked for approval", description: client && !approvers.length ? "The client answers from their link." : undefined })
      onClose()
    } catch (e) {
      setRefused(apiErrorMessage(e, "Couldn't ask. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>Cancel</Button>
      <Button type="button" className="h-11 md:h-9" disabled={!canAsk} busy={busy} onClick={() => void send()}>
        {busy ? "Asking…" : "Ask"}
      </Button>
    </>
  )

  return (
    <ResponsiveDialog title="Ask for approval" description="Approvers answer on the task, and the client from their link." footer={footer} onClose={onClose}>
      <div className="space-y-5" data-ask-approval="">
        {waiting && <p role="status" className="rounded-lg bg-sunken p-3 text-sm text-ink-2">It&apos;s waiting for approval already. Its card on the task says who has answered.</p>}
        <section className="space-y-2" aria-labelledby="ask-who">
          <h3 id="ask-who" className="text-xs font-medium text-ink-2">Who approves it</h3>
          {info.isError && !info.data ? (
            <ErrorState compact subject="this project's people" onRetry={() => void info.mutate()} />
          ) : !info.data ? (
            <div role="status" aria-label="Loading people" className="flex gap-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[26px] w-24 rounded-sm" />)}</div>
          ) : people.length ? (
            <PeopleChips label="Approvers" people={people} picked={approvers} onChange={(ids) => { setApprovers(ids); setNeeded((n) => neededFor(n, ids.length)) }} />
          ) : (
            <p className="text-sm text-ink-3">Nobody else is in this project yet. Ask the client, or add people to the project first.</p>
          )}
          <ApprovalsNeeded needed={needed} of={approvers.length} onChange={setNeeded} />
          <ClientToo pressed={client} onChange={setClient} />
        </section>
        <section className="space-y-2" aria-labelledby="ask-when">
          <h3 id="ask-when" className="text-xs font-medium text-ink-2">By when <span className="font-normal text-ink-3">(optional)</span></h3>
          <div className="flex flex-wrap gap-2">
            <DateField aria-label="Due date" value={day} min={localDay()} onChange={setDay} className="w-auto" />
            {day && <TimeField aria-label="Due time" value={time} onChange={setTime} className="w-auto" />}
          </div>
        </section>
        <section className="space-y-2" aria-labelledby="ask-what">
          <h3 id="ask-what" className="text-xs font-medium text-ink-2">What you ask <span className="font-normal text-ink-3">(optional)</span></h3>
          <Textarea aria-labelledby="ask-what" rows={3} value={words} onChange={(e) => setWords(e.target.value)} placeholder="Is the launch copy final?" aria-invalid={tooLong || undefined} className="text-sm" />
          {words.length > MAX_ASK - 50 && <p className={tooLong ? "text-meta text-danger-ink" : "text-meta text-ink-3"}>{`${words.length} of ${MAX_ASK}`}</p>}
        </section>
        {refused && <p role="alert" className="text-sm text-danger-ink">{refused}</p>}
      </div>
    </ResponsiveDialog>
  )
}
