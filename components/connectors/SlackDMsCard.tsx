"use client"

/**
 * Bring your Slack DMs (chat item 2, the move from Slack). A team on Slack's
 * free or Pro plan exports its public channels alone, so the admin's import
 * brings those, and each member brings their own DMs, group DMs and private
 * channels here, with their own Slack token.
 *
 * Shown once the team has imported Slack (or the member has read before):
 * before then there is nothing for their DMs to go into. The read runs on the
 * server, then plans and runs itself, as them; this card follows it, says
 * why it waits, lets them stop it, and says what came across. The token is
 * sent once and held on the server for the read alone. Admins see that a read
 * happened, whose and how many conversations, never what's in it.
 *
 * Loaded on its own (the connectors page's dynamic import), so the page's
 * first load is what it was.
 */

import React, { useId, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { useDemoVisitor } from "@/hooks/useDemoVisitor"
import { CircleStop, Loader2, Lock } from "@/lib/icons"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { ConnectionCard, SourceMark, StateWord, type StateTone } from "@/components/admin/connectParts"
import { ConnectionBanner } from "@/components/admin/integrationParts"
import { Disclosure } from "@/components/ui/disclosure"
import { ImportProgressBar } from "@/components/admin/importParts"
import { DM_READ_APP, SlackTokenHelp } from "@/components/admin/slackTokenHelp"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { apiReadOf, slackJobLive, slackJobPercent, slackJobState, slackTokenKind, type SlackImportJob } from "@/services/slackImportService"
import { count } from "@/lib/utils/count"
import { shortDate } from "@/lib/utils/date/shortDate"
import {
  MY_SLACK_DMS_KEY,
  bringMySlackDMs,
  getMySlackReadNotes,
  getMySlackReads,
  stopMySlackRead,
  type MySlackReads,
} from "@/components/connectors/mySlackDMs"

/** While a read is under way, how often the card looks again. */
const POLL_MS = 3000

/** Where the member's latest read stands, as the card's state word. */
const READ_STATE: Record<string, { label: string; tone: StateTone; pulse?: boolean }> = {
  none: { label: "Not brought yet", tone: "neutral" },
  reading: { label: "Reading", tone: "warning", pulse: true },
  queued: { label: "Queued", tone: "neutral" },
  waiting: { label: "Waiting", tone: "neutral" },
  validating: { label: "Getting ready", tone: "info" },
  planned: { label: "Getting ready", tone: "info" },
  running: { label: "Bringing in", tone: "warning", pulse: true },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Brought", tone: "success" },
  failed: { label: "Didn't finish", tone: "danger" },
  cancelled: { label: "Stopped", tone: "neutral" },
  rolled_back: { label: "Removed", tone: "neutral" },
}

/** What a member's read brings and who sees it, in full: said before any token is asked for. */
const WHAT_COMES = (
  <>
    Your team&apos;s Slack came across without anyone&apos;s DMs. Bring yours with your own Slack token: your DMs, group DMs
    and the private channels you&apos;re in. The other people&apos;s messages in them come across too, and each conversation
    stays private: only the people in it can see it.
  </>
)

/** "9 DMs, 3 group DMs and 2 private channels". Pure. */
export function conversationsLine(read: { dms?: number; mpims?: number; groups?: number }): string {
  const parts = [
    read.dms ? count(read.dms, "DM", "DMs") : "",
    read.mpims ? count(read.mpims, "group DM", "group DMs") : "",
    read.groups ? count(read.groups, "private channel", "private channels") : "",
  ].filter(Boolean)
  if (parts.length === 0) return "no conversations"
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/** What's wrong with a token before it is sent, in the member's words, or null. Pure. */
export function memberTokenProblem(token: string): string | null {
  const kind = slackTokenKind(token)
  if (kind === "bot") return "A bot token reads only the channels its app was added to, never your DMs. Use your own user token: it starts xoxp-."
  if (kind !== "user") return "That isn't a Slack user token. Yours starts xoxp-."
  return null
}

/** What the latest read is doing, in a sentence, while it's under way. Pure. */
export function underWayLine(job: SlackImportJob): string {
  const read = apiReadOf(job)
  switch (slackJobState(job)) {
    case "queued":
      return "Waiting for another read on this server to finish. Yours starts after it."
    case "waiting":
      return "Read. Waiting for an import of your team's Slack to finish, then yours comes in."
    case "reading":
      return read && read.of > 0
        ? `Reading from Slack: ${read.conversations.toLocaleString("en-GB")} of ${count(read.of, "conversation", "conversations")}.`
        : "Reading from Slack."
    case "running":
    case "paused":
      return `Bringing them in: ${count(job.items_imported, "message", "messages")} so far.`
    default:
      return "Getting ready to bring them in."
  }
}

/** How far the latest read is, 0 to 100, while it reads or comes in. Pure. */
function percentOf(job: SlackImportJob): number | undefined {
  const s = slackJobState(job)
  return s === "reading" || s === "running" || s === "paused" ? slackJobPercent(job) : undefined
}

/** The read's day, as the app writes a date ("21 Oct", with its year when not this year). */
function dayOf(iso?: string): string {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? shortDate(d) : ""
}

/** What a read noted (a kind Slack didn't give, a file it couldn't), read when opened. */
function ReadNotes({ job }: { job: SlackImportJob }) {
  const [open, setOpen] = useState(false)
  const { data, error } = useSWR(open ? [MY_SLACK_DMS_KEY, job.id, "notes"] : null, () => getMySlackReadNotes(job.id), {
    revalidateOnFocus: false,
  })
  return (
    <Disclosure
      data-slack-dms-notes=""
      className="text-xs"
      summary={`What Slack didn't give (${job.errors_total.toLocaleString("en-GB")})`}
      summaryClassName="font-medium text-foreground"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      {error ? (
        <>
          <SaysLoadFailure />
          <p className="mt-1.5 text-danger-ink">Couldn&apos;t load them. Close this and open it again.</p>
        </>
      ) : !data ? (
        <p className="mt-1.5 text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-1.5 max-w-[65ch] list-disc space-y-1 pl-4 text-muted-foreground">
          {data.map((n) => (
            <li key={n.id}>{n.message}</li>
          ))}
        </ul>
      )}
    </Disclosure>
  )
}

export default function SlackDMsCard() {
  const demoVisitor = useDemoVisitor()
  // The demo connects nobody's own accounts: its line under the connectors says so.
  if (demoVisitor) return null
  return <SlackDMs />
}

function SlackDMs() {
  const { data, mutate } = useSWR<MySlackReads>(MY_SLACK_DMS_KEY, getMySlackReads, {
    revalidateOnFocus: false,
    refreshInterval: (d) => (d?.reads?.[0] && slackJobLive(d.reads[0]) ? POLL_MS : 0),
  })
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState("")
  const [tokenError, setTokenError] = useState("")
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const formId = useId()

  // Nothing to bring them into yet, and nothing brought: no card.
  if (!data || (!data.team_imported && data.reads.length === 0)) return null

  const latest = data.reads[0]
  const live = !!latest && slackJobLive(latest)
  const state = READ_STATE[latest ? slackJobState(latest) : "none"] ?? READ_STATE.none
  const read = latest ? (latest.progress?.read as { dms?: number; mpims?: number; groups?: number } | undefined) : undefined
  const pct = latest && live ? percentOf(latest) : undefined

  const start = async () => {
    const problem = memberTokenProblem(token)
    if (problem) {
      setTokenError(problem)
      return
    }
    setStarting(true)
    setTokenError("")
    try {
      await bringMySlackDMs(token.trim())
      setToken("")
      setOpen(false)
      toast({ title: "Reading your DMs from Slack", description: "They come in by themselves when the read ends. You can leave this page." })
      await mutate()
    } catch (e) {
      setTokenError(
        apiErrorStatus(e) === 429
          ? "That's three tries in a minute. Wait a minute, then try again."
          : apiErrorMessage(e, "Your DMs didn't start coming across. Try again in a minute."),
      )
    } finally {
      setStarting(false)
    }
  }

  const stop = (job: SlackImportJob) =>
    confirm({
      title: "Stop bringing your DMs?",
      description: "What has come across so far stays. You can bring them again later.",
      confirmText: "Stop bringing DMs",
      destructive: true,
      onConfirm: async () => {
        setStopping(true)
        try {
          await stopMySlackRead(job.id)
          toast({ title: "Stopped", description: "What came across stays." })
          await mutate()
        } catch (e) {
          toast({ title: "Couldn't stop it", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
          setStopping(false)
        }
      },
    })

  const action = live ? (
    <Button variant="ghost" size="sm" className="h-11 md:h-7" onClick={() => latest && stop(latest)} disabled={stopping}>
      {stopping ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CircleStop aria-hidden="true" />}
      Stop
    </Button>
  ) : open ? null : (
    <Button
      variant="secondary"
      size="sm"
      className="h-11 md:h-7"
      aria-expanded={false}
      aria-controls={formId}
      onClick={() => setOpen(true)}
    >
      {latest?.status === "completed" ? "Bring again" : "Bring my DMs"}
    </Button>
  )

  return (
    <ConnectionCard
      level={2}
      aria-label="Your Slack DMs"
      mark={<SourceMark vendor="slack" name="Slack" />}
      name="Your Slack DMs"
      state={
        <span data-slack-dms-state={latest ? slackJobState(latest) : "none"} className="inline-flex shrink-0">
          <StateWord tone={state.tone} pulse={state.pulse}>
            {state.label}
          </StateWord>
        </span>
      }
      action={action}
    >
      {latest?.status === "failed" && (
        <ConnectionBanner tone="danger">{latest.error_message || "Your DMs didn't finish coming across."}</ConnectionBanner>
      )}
      <div data-slack-dms="" className="cx-int-note space-y-3">
        {/* Where it stands leads, once there is a read; then what it brings, in a line. */}
        {latest && live && (
          <div data-slack-dms-progress="" className="space-y-1.5">
            <p className="text-xs text-foreground" aria-live="polite">
              {underWayLine(latest)}
            </p>
            {pct !== undefined && (
              // The bar is a flex item's size, as in the import history's row.
              <div className="flex">
                <ImportProgressBar pct={pct} running={slackJobState(latest) === "running"} />
              </div>
            )}
          </div>
        )}

        {latest?.status === "completed" && (
          <p data-slack-dms-brought="" className="text-xs text-foreground">
            Brought {conversationsLine(read ?? {})} on {dayOf(latest.completed_at ?? latest.updated_at)}.
          </p>
        )}
        {latest && !live && latest.errors_total > 0 && <ReadNotes key={latest.id} job={latest} />}

        {!open && (
          <Disclosure
            data-slack-dms-what=""
            className="text-xs"
            summary="Your DMs, group DMs and private channels, each private to its people"
            summaryClassName="text-muted-foreground"
          >
            <p className="mt-1.5 max-w-[65ch] text-muted-foreground text-pretty">{WHAT_COMES}</p>
          </Disclosure>
        )}

        {open && !live && (
          <form
            id={formId}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void start()
            }}
          >
            <p className="max-w-[65ch] text-xs text-muted-foreground text-pretty">{WHAT_COMES}</p>
            <Field
              label="Your Slack user token"
              help="It starts xoxp-. It's sent once, held in memory for this read alone, and never stored."
              error={tokenError}
            >
              <Input
                type="password"
                placeholder="xoxp-…"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                  setTokenError("")
                }}
                disabled={starting}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </Field>
            <SlackTokenHelp app={DM_READ_APP} />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground text-pretty">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              Your admins see that you brought your DMs, and how many conversations. Never what&apos;s in them.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-8"
                onClick={() => {
                  setOpen(false)
                  setToken("")
                  setTokenError("")
                }}
                disabled={starting}
              >
                Cancel
              </Button>
              <Button type="submit" className="h-11 md:h-8" disabled={!token.trim()} busy={starting}>
                Start
              </Button>
            </div>
          </form>
        )}
      </div>
    </ConnectionCard>
  )
}
