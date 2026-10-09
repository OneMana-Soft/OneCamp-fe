"use client"

/**
 * ImportInviteDialog — "Invite the N people who came across".
 *
 * An import makes everyone it meets a placeholder so their work keeps their
 * name, and a placeholder can't sign in. This lists the people from one import
 * who can be invited now, ticked as far as the plan has room, and sends the
 * invitations in one step through the workspace's invitation endpoint, so each
 * has the seat check, the email and the link every invitation has. When they
 * join with that address their placeholder becomes their account, with the
 * history under it.
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorState } from "@/components/ui/error-state"
import { Loader2, Users } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import {
  IMPORT_OUTCOMES_KEY,
  importPeopleKey,
  inviteImportedPeople,
  type ImportPeople,
  type InviteRun,
} from "@/services/importService"
import { GetEndpointUrl } from "@/services/endPoints"
import { emailLine, initialSelection, inviteSummary, notListedLine, roomForAnother, seatLine } from "@/lib/importInvites"

interface Props {
  jobId: string
  /** What the import was called ("Acme" or the Slack workspace's name). */
  label?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportInviteDialog({ jobId, label, open, onOpenChange }: Props) {
  const { data, isError, isLoading, mutate } = useFetch<ImportPeople>(open ? importPeopleKey(jobId) : "", undefined, undefined, OWN_ERRORS)
  const people = useMemo(() => data?.people ?? [], [data])
  const seats = data?.seats ?? { used: 0, limit: 0, left: null }
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [run, setRun] = useState<InviteRun | null>(null)

  // Ticked afresh whenever the list arrives: after a run, the people invited
  // leave it and the plan's room changes.
  useEffect(() => {
    if (data) setSelected(initialSelection(data.people, data.seats, data.email))
  }, [data])

  useEffect(() => {
    if (!open) {
      setRun(null)
      setProgress(null)
    }
  }, [open])

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const send = async () => {
    const chosen = people.filter((p) => selected.has(p.user_id))
    if (!chosen.length) return
    setProgress({ done: 0, total: chosen.length })
    const result = await inviteImportedPeople(chosen, (done, total) => setProgress({ done, total }))
    setProgress(null)
    setRun(result)
    void mutate()
    void appMutate(IMPORT_OUTCOMES_KEY)
    void appMutate(GetEndpointUrl.GetAdminInvitationList)
  }

  const sending = progress !== null
  const seatsText = data ? seatLine(seats) : null
  const notListed = data ? notListedLine(data) : ""
  const count = selected.size
  const emailText = data ? emailLine(data.email, count) : null

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Invite the people who came across
          </DialogTitle>
          <DialogDescription>
            {label ? `From ${label}. ` : ""}
            Their tasks, comments and messages are already here under their names. When they join with this
            address, all of it is theirs.
          </DialogDescription>
        </DialogHeader>

        {isLoading && !data ? (
          <div role="status" aria-label="Loading the people" className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError && !data ? (
          <ErrorState subject="the people from this import" onRetry={() => void mutate()} />
        ) : run ? (
          <ul className="space-y-2 text-sm" aria-label="What happened">
            {inviteSummary(run, data?.email).map((line) => (
              <li key={line} className="break-words">{line}</li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {seatsText && (
              <p className={seats.left === 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{seatsText}</p>
            )}
            {emailText && <p className="text-sm text-muted-foreground">{emailText}</p>}
            {people.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Nobody left to invite: everyone who came across is already here or invited.
              </p>
            ) : (
              <ul className="divide-y rounded-md border" aria-label="People who came across">
                {people.map((p) => {
                  const on = selected.has(p.user_id)
                  const blocked = !on && !roomForAnother(count, seats)
                  return (
                    <li key={p.user_id}>
                      <label className="flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2 has-[:disabled]:cursor-not-allowed">
                        <Checkbox
                          checked={on}
                          disabled={blocked || sending}
                          onCheckedChange={(v) => toggle(p.user_id, v === true)}
                          aria-label={`Invite ${p.name}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {notListed && <p className="text-xs text-muted-foreground">{notListed}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {run ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Not now
              </Button>
              <Button onClick={send} disabled={sending || count === 0}>
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inviting {progress.done} of {progress.total}…
                  </>
                ) : (
                  `Invite ${count} ${count === 1 ? "person" : "people"}`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
