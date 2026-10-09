"use client"

// Tells the admin who started an import how it ended, wherever they are.
//
// WHY. An import runs for minutes or hours after Start, and it used to end in
// silence: the only way to learn it had finished, or had stopped on an expired
// token halfway through, was to go back to the import screen and look. And a
// finished import is the moment to bring the team in, so the banner offers the
// people who came across in the same breath.
//
// The server keeps the news per admin and per import, so dismissing it here
// dismisses it on every device. An import's progress event (MQTT) refreshes it
// the moment it ends; the five-minute refresh covers a missed event.

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ImportInviteDialog } from "@/components/admin/ImportInviteDialog"
import {
  IMPORT_OUTCOMES_KEY,
  importProviderLabel,
  markImportOutcomeSeen,
  type ImportOutcome,
} from "@/services/importService"

/** What the banner says about one import. Pure. */
export function outcomeText(o: ImportOutcome): string {
  const what = `Your ${importProviderLabel(o.provider)} import of ${o.label}`
  if (o.status === "failed") {
    const why = (o.error ?? "").trim()
    return why ? `${what} stopped: ${/[.!?]$/.test(why) ? why : `${why}.`}` : `${what} stopped.`
  }
  const items = o.items_imported > 0 ? `: ${o.items_imported.toLocaleString()} ${o.items_imported === 1 ? "item" : "items"} came across.` : "."
  return `${what} finished${items}`
}

export function ImportOutcomeBanner({ isAdmin }: { isAdmin?: boolean }) {
  const { data, mutate } = useFetch<{ outcomes: ImportOutcome[] }>(
    isAdmin ? IMPORT_OUTCOMES_KEY : "",
    undefined,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
    OWN_ERRORS,
  )
  const [inviting, setInviting] = useState<ImportOutcome | null>(null)
  // Dismissed here, gone at once; the server's list settles it after.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const outcomes = (data?.outcomes ?? []).filter((o) => !dismissed.has(o.job_id))
  const outcome = outcomes[0]

  const dismiss = async (o: ImportOutcome) => {
    setDismissed((prev) => new Set(prev).add(o.job_id))
    await markImportOutcomeSeen(o.job_id).catch(() => undefined)
    void mutate()
  }

  return (
    <>
      {isAdmin && outcome && (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-xs",
            outcome.status === "failed"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-foreground",
          )}
        >
          {outcome.status === "failed" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1 break-words">
            {outcomeText(outcome)}
            {outcomes.length > 1 && (
              <span className="text-muted-foreground"> And {outcomes.length - 1} more.</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {outcome.status === "completed" && outcome.people_to_invite > 0 && (
              <Button size="sm" className="h-7 text-xs" onClick={() => setInviting(outcome)}>
                Invite the {outcome.people_to_invite} {outcome.people_to_invite === 1 ? "person" : "people"} who came across
              </Button>
            )}
            <Link href="/app/admin?tab=import" className="font-medium underline underline-offset-2">
              {outcome.status === "failed" ? "Open imports" : "See imports"}
            </Link>
            <button
              onClick={() => void dismiss(outcome)}
              aria-label="Dismiss"
              className="rounded p-0.5 hover:bg-foreground/10"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {inviting && (
        <ImportInviteDialog
          jobId={inviting.job_id}
          label={inviting.label}
          open
          onOpenChange={(o) => {
            if (!o) setInviting(null)
          }}
        />
      )}
    </>
  )
}
