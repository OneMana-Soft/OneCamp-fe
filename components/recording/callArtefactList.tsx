import type { MouseEvent } from "react"
import Link from "next/link"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { Button } from "@/components/ui/button"
import { Captions, FileText, MessageSquare, PlayCircle, Trash2 } from "@/lib/icons"
import { chatRef, route } from "@/lib/conversation/route"
import { wantsNewTab } from "@/lib/liveEntity/follow"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { app_doc_path } from "@/types/paths"
import { callLength } from "@/lib/calls/callLength"
import type { CallArtefact } from "@/lib/calls/callArtefacts"

/**
 * The one list of what calls kept: an event's "Recordings & notes" (components/calendar/eventRecordings) draws it,
 * and so does each call on a board's Calls (components/board/boardCall). A recorded call plays in the one player
 * (onPlay), its words beside it; one that wasn't recorded is read there (Read transcript); its notes open; the
 * conversation its recap went to opens for whoever is in it. A link that opens here leaves the list's surface
 * (onLeave); one opened in a new tab leaves it be. Given onDelete, each call offers a Delete of what it made. It only
 * presents, in its own module: both callers are lazy chunks, and neither takes the other's (lib/lazy/lazyStaticGuard).
 */

/** When a call was, and for how long. */
function when(a: CallArtefact): string {
  const start = a.started_at ? new Date(a.started_at) : null
  if (!start || Number.isNaN(start.getTime())) return "A call"
  const seconds = a.ended_at ? (new Date(a.ended_at).getTime() - start.getTime()) / 1000 : NaN
  return seconds >= 0 ? `${shortDateTime(start)} · ${callLength(seconds)}` : shortDateTime(start)
}

/**
 * Where the conversation a recap went to opens, or null. A DM opens only for
 * its two people: for anyone else chatRef names the reader's own DM with one
 * of them.
 */
function conversationOf(recap: string | undefined, self: string | undefined): string | null {
  if (!recap) return null
  const ref = chatRef(recap, self)
  if (!ref || (ref.kind === "dm" && !recap.split(" ").includes(self ?? ""))) return null
  return route({ conversation: ref })
}

/** A call's Delete, as its toast names it: what it takes, and when the call was. */
export interface CallToDelete {
  key: string
  what: "recording" | "transcript"
  label: string
}

/**
 * A call the one player opens, by its key: its recording when it was recorded
 * (else that it wasn't), and its words when it kept some.
 */
export interface CallToPlay {
  key: string
  recorded: boolean
  transcript: boolean
}

export interface CallArtefactsProps {
  calls: CallArtefact[]
  selfUUID?: string
  onPlay: (call: CallToPlay) => void
  onDelete?: (call: CallToDelete) => void
  onLeave?: () => void
  /** Drawn under its call's own line (a board's Calls), which says when and links its chat: each row leaves both out. */
  underCall?: { chat: string | null }
}

export function CallArtefacts({ calls, selfUUID, onPlay, onDelete, onLeave, underCall }: CallArtefactsProps) {
  const leave = onLeave
    ? (e: MouseEvent) => {
        if (!wantsNewTab(e)) onLeave()
      }
    : undefined
  return (
    <ul className="flex flex-col gap-2">
      {calls.map((a) => {
        const recap = conversationOf(a.recap_chat, selfUUID)
        const chat = recap !== underCall?.chat ? recap : null
        const what = a.recorded ? "recording" : "transcript"
        return (
          <li key={a.key} className="flex flex-col gap-1.5 rounded-lg border border-border/60 px-3 py-2.5">
            {!underCall && <span className="text-sm text-foreground">{when(a)}</span>}
            {a.lines > 0 && <span className="text-xs text-muted-foreground">{`Transcript, ${a.lines} ${a.lines === 1 ? "line" : "lines"}`}</span>}
            <div className="flex flex-wrap items-center gap-1.5">
              {a.recorded ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => onPlay({ key: a.key, recorded: true, transcript: a.lines > 0 })}>
                  <PlayCircle className="size-4" aria-hidden />
                  Play recording
                </Button>
              ) : a.lines > 0 ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => onPlay({ key: a.key, recorded: false, transcript: true })}>
                  <Captions className="size-4" aria-hidden />
                  Read transcript
                </Button>
              ) : null}
              {a.notes_doc && (
                <Button asChild size="sm" variant="ghost">
                  {/* A docs route is fetched on intent, never on sight (docRouteIntent.test). */}
                  <IntentLink href={`${app_doc_path}/${a.notes_doc}`} onClick={leave}>
                    <FileText className="size-4" aria-hidden />
                    Call notes
                  </IntentLink>
                </Button>
              )}
              {chat && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={chat} onClick={leave}>
                    <MessageSquare className="size-4" aria-hidden />
                    Conversation
                  </Link>
                </Button>
              )}
              {onDelete && (
                <Button type="button" size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-danger-ink" onClick={() => onDelete({ key: a.key, what, label: when(a) })}>
                  <Trash2 className="size-4" aria-hidden />
                  {`Delete ${what}`}
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
