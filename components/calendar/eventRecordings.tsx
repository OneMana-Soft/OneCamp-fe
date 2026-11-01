import { useId, type MouseEvent } from "react"
import Link from "next/link"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { Button } from "@/components/ui/button"
import { Captions, FileText, MessageSquare, PlayCircle, Trash2 } from "@/lib/icons"
import { chatRef, route } from "@/lib/conversation/route"
import { wantsNewTab } from "@/lib/liveEntity/follow"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { sectionTitle } from "@/lib/ui/fieldRow"
import { app_doc_path } from "@/types/paths"

/**
 * An event's "Recordings & notes" (meet-02, calls head C): each of its calls
 * that kept something, newest first, as GET /calendar/events/{id}/call/artefacts
 * answers whoever may read the event (the calendar's own rule: the panel shows
 * only what that answer holds). A recorded call plays in the one player
 * (onPlay), its words beside it; one that wasn't recorded is read there
 * (Read transcript, head C2); its notes open; the conversation its recap went
 * to opens for whoever is in it, and a link that leaves the event in this tab
 * tells the panel (onLeave). Given onDelete (whoever may change the event),
 * each call offers a Delete of what it made, its recording and transcript.
 * It only presents: the panel fetches, deletes and offers Undo, as this lazy
 * chunk takes none of the shared core.
 */

export interface CallArtefact {
  key: string
  started_at?: string
  ended_at?: string
  lines: number
  notes_doc?: string
  recap_chat?: string
  recorded: boolean
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined)

/** The calls in an artefacts answer, leaving out anything malformed. Pure. */
export function readArtefacts(body: unknown): CallArtefact[] {
  const list = (body as { data?: unknown } | null | undefined)?.data
  if (!Array.isArray(list)) return []
  const out: CallArtefact[] = []
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>
    const key = text(r.key)
    if (!key) continue
    const a: CallArtefact = { key, lines: typeof r.lines === "number" && r.lines > 0 ? r.lines : 0, recorded: r.recorded === true }
    for (const f of ["started_at", "ended_at", "notes_doc", "recap_chat"] as const) {
      const v = text(r[f])
      if (v) a[f] = v
    }
    out.push(a)
  }
  return out
}

/** When a call was, and for how long. */
function when(a: CallArtefact): string {
  const start = a.started_at ? new Date(a.started_at) : null
  if (!start || Number.isNaN(start.getTime())) return "A call"
  const end = a.ended_at ? new Date(a.ended_at).getTime() : NaN
  const mins = Number.isNaN(end) ? 0 : Math.max(1, Math.round((end - start.getTime()) / 60_000))
  return mins ? `${shortDateTime(start)} · ${mins} min` : shortDateTime(start)
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

export function EventRecordings({ body, selfUUID, onPlay, onDelete, onLeave }: { body: unknown; selfUUID?: string; onPlay: (call: CallToPlay) => void; onDelete?: (call: CallToDelete) => void; onLeave?: () => void }) {
  const titleId = useId()
  const calls = readArtefacts(body)
  if (calls.length === 0) return null
  // A link that opens here leaves the event; one opened in a new tab leaves it be.
  const leave = onLeave
    ? (e: MouseEvent) => {
        if (!wantsNewTab(e)) onLeave()
      }
    : undefined
  return (
    <section aria-labelledby={titleId} className="mt-6 flex flex-col gap-2">
      <h3 id={titleId} className={sectionTitle}>Recordings & notes</h3>
      <ul className="flex flex-col gap-2">
        {calls.map((a) => {
          const chat = conversationOf(a.recap_chat, selfUUID)
          const what = a.recorded ? "recording" : "transcript"
          return (
            <li key={a.key} className="flex flex-col gap-1.5 rounded-lg border border-border/60 px-3 py-2.5">
              <span className="text-sm text-foreground">{when(a)}</span>
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
    </section>
  )
}
