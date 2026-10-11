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

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { NoticeBar, noticeActionClass } from "@/components/banner/NoticeBar"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { SpotImported } from "@/components/ui/graphics"
import { celebrate } from "@/lib/celebrate"
import {
  IMPORT_OUTCOMES_KEY,
  importProviderLabel,
  markImportOutcomeSeen,
  type ImportOutcome,
} from "@/services/importService"

// Loaded when it is opened: the banner sits in the app shell, and the invite
// dialog came down there for every member before anyone opened it.
const ImportInviteDialog = dynamic(
  () => import("@/components/admin/ImportInviteDialog").then((m) => m.ImportInviteDialog),
  { ssr: false },
)

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

  // A finished import is one of the playful layer's two moments of
  // celebration, so its spot bursts once: when the news arrives while the
  // person is in the app (the progress event or the refresh), never for news
  // already waiting at the first load (after a reload, say).
  const spotRef = useRef<HTMLSpanElement>(null)
  const atFirstLoad = useRef<Set<string> | null>(null)
  const burst = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!data) return
    if (atFirstLoad.current === null) {
      atFirstLoad.current = new Set((data.outcomes ?? []).map((o) => o.job_id))
      return
    }
    if (!outcome || outcome.status !== "completed") return
    if (atFirstLoad.current.has(outcome.job_id) || burst.current.has(outcome.job_id)) return
    burst.current.add(outcome.job_id)
    celebrate(spotRef.current)
  }, [data, outcome])

  const dismiss = async (o: ImportOutcome) => {
    setDismissed((prev) => new Set(prev).add(o.job_id))
    await markImportOutcomeSeen(o.job_id).catch(() => undefined)
    void mutate()
  }

  return (
    <>
      {isAdmin && outcome && (
        <NoticeBar
          tone={outcome.status === "failed" ? "danger" : "info"}
          icon={
            outcome.status === "failed" ? undefined : (
              <span ref={spotRef} className="flex shrink-0">
                <SpotImported size={20} hue="moss" />
              </span>
            )
          }
          onDismiss={() => void dismiss(outcome)}
          action={
            outcome.status === "completed" && outcome.people_to_invite > 0 ? (
              <button type="button" className={noticeActionClass} onClick={() => setInviting(outcome)}>
                Invite the {outcome.people_to_invite} {outcome.people_to_invite === 1 ? "person" : "people"} who came across
              </button>
            ) : undefined
          }
        >
          {outcomeText(outcome)}
          {outcomes.length > 1 && <span className="text-ink-3"> And {outcomes.length - 1} more.</span>}{" "}
          <Link href="/app/admin?tab=import">{outcome.status === "failed" ? "Open imports" : "See imports"}</Link>
        </NoticeBar>
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
