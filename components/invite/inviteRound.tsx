"use client"

// One round of invitations and its rows (SHELL-02), shared by the invite
// dialogs (InviteForm) and the first run's last step (FirstRun's TeamStep):
// the addresses are invited in turn, so each row resolves where the reader is
// looking and the server is not asked twenty things at once, and each row
// says whether its email went, with its link when it didn't. Two or more
// links that couldn't be emailed are offered at once, to paste into one
// message.

import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, Check, Copy, Link2, Loader2 } from "@/lib/icons"
import { invite, type InvitationAnswer } from "@/services/invitationService"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { couldntEmail } from "@/components/invite/InvitationOutcome"
import { COPY_LINKS, linksCopied, linksText } from "@/lib/invite/inviteCopy"

export type InviteResult =
  | { email: string; state: "waiting" }
  | { email: string; state: "sent" | "created"; answer: InvitationAnswer }
  /** limit: the free plan's, when the refusal was for want of a place. */
  | { email: string; state: "refused"; msg: string; limit?: number }

/** A row refused for want of a place: the limit note under the rows says the rest, once. */
export const NO_PLACE = "No place left on the free plan."

/** The limit a round's seat refusal named, or 0. Pure. */
export function seatLimitOf(results: InviteResult[] | null): number {
  for (const r of results ?? []) if (r.state === "refused" && r.limit) return r.limit
  return 0
}

/** "4 sent · 1 to share by link · 1 refused". Pure. */
export function resultSummary(results: Pick<InviteResult, "state">[]): string {
  const n = (s: InviteResult["state"]) => results.filter((r) => r.state === s).length
  return [
    n("sent") && `${n("sent")} sent`,
    n("created") && `${n("created")} to share by link`,
    n("refused") && `${n("refused")} refused`,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Invites `emails` in turn through the admin's route (`asAdmin`) or a
 * member's, each row resolving as its answer comes. `run` answers the round's
 * rows once every one has; null results until a round starts.
 */
export function useInviteRound(asAdmin: boolean) {
  const [results, setResults] = useState<InviteResult[] | null>(null)
  const [sending, setSending] = useState(false)

  const run = useCallback(
    async (emails: string[]): Promise<InviteResult[]> => {
      const rows: InviteResult[] = emails.map((email) => ({ email, state: "waiting" }))
      setResults([...rows])
      setSending(true)
      for (let i = 0; i < rows.length; i++) {
        const outcome = await invite(rows[i].email, asAdmin)
        const limit = !outcome.ok && outcome.code === "seat_limit" ? outcome.limit : undefined
        rows[i] = outcome.ok
          ? { email: rows[i].email, state: outcome.answer.email_sent ? "sent" : "created", answer: outcome.answer }
          : limit
            ? { email: rows[i].email, state: "refused", msg: NO_PLACE, limit }
            : { email: rows[i].email, state: "refused", msg: outcome.msg }
        setResults([...rows])
      }
      setSending(false)
      return rows
    },
    [asAdmin],
  )

  const reset = useCallback(() => setResults(null), [])
  return { results, sending, run, reset }
}

/**
 * A round's rows; with two or more links to hand over, once it's done, Copy all
 * links. With email off (`emailOn` false) a link is what was asked for: its row
 * is ready, and why no email went is the caller's one line over the rows.
 */
export function InviteResults({ results, emailOn = true }: { results: InviteResult[]; emailOn?: boolean }) {
  const { copied, copy } = useCopyToClipboard()
  const links = results.flatMap((r) => (r.state === "created" && r.answer.invite_link ? [{ email: r.email, link: r.answer.invite_link }] : []))
  const done = !results.some((r) => r.state === "waiting")
  return (
    <div className="grid gap-2">
      <ul aria-label="Invitations" aria-live="polite" data-invite-results="" className="space-y-1 py-1">
        {results.map((r, i) => (
          <ResultRow key={r.email} result={r} index={i} emailOn={emailOn} />
        ))}
      </ul>
      {done && links.length > 1 && (
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => void copy(linksText(links), linksCopied(links.length))}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {COPY_LINKS}
          </Button>
        </div>
      )}
    </div>
  )
}

function ResultRow({ result, index, emailOn }: { result: InviteResult; index: number; emailOn: boolean }) {
  const { copied, copy } = useCopyToClipboard()
  const link = "answer" in result ? result.answer.invite_link : undefined
  return (
    <li data-invite-result={result.state} className="invite-result flex min-h-9 flex-wrap items-center gap-x-3 pointer-coarse:min-h-11" style={{ ["--i" as string]: index }}>
      <span className="inline-flex size-5 shrink-0 items-center justify-center" aria-hidden="true" data-invite-mark={result.state === "created" && !emailOn ? "ready" : result.state}>
        {result.state === "waiting" ? (
          <Loader2 className="size-4 animate-spin text-ink-3" />
        ) : result.state === "sent" ? (
          <Check className="size-4 text-success-ink" />
        ) : result.state === "created" && !emailOn ? (
          <Link2 className="size-4 text-ink-2" />
        ) : (
          <AlertCircle className={result.state === "refused" ? "size-4 text-danger-ink" : "size-4 text-camp-sun-ink"} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm" translate="no">
        {result.email}
      </span>
      {result.state === "sent" && <span className="text-xs text-ink-3">Sent</span>}
      {/* The reason whole, under the address: it is the row's answer, a phone has no hover for a title, and
          beside the address it cut the address short. Read before Copy link; order-last draws it under. */}
      {result.state === "created" && emailOn && <span className="order-last basis-full pb-1 pl-8 text-xs text-camp-sun-ink">{couldntEmail(result.answer)}</span>}
      {result.state === "created" && link && (
        <Button type="button" size="xs" variant="secondary" onClick={() => void copy(link, "Invitation link copied")} aria-label={`Copy the link for ${result.email}`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          Copy link
        </Button>
      )}
      {result.state === "refused" && <span className="basis-full pb-1 pl-8 text-xs text-danger-ink">{result.msg}</span>}
    </li>
  )
}
