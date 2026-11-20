import { useId, useState, type ComponentType } from "react"
import { sectionTitle } from "@/lib/ui/fieldRow"
import { readArtefacts } from "@/lib/calls/callArtefacts"
import { CallArtefacts, type CallArtefactsProps } from "@/components/recording/callArtefactList"
import { CallRecap, type RecapMeans } from "@/components/calendar/callRecap"

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
 * Each call shows its recap and action items (gcal-new-event-notes), with
 * Make task given the panel's means (recap); the organiser has "Send the
 * recap to guests" (recapToGuests), shown before any call kept anything, drawn
 * by the panel's own Switch (Toggle): a shell module this chunk never imports,
 * or every route's shared chunks re-cut round it (gcal-new-event-notes size).
 * It only presents: the panel fetches, deletes and offers Undo, as this lazy
 * chunk takes none of the shared core.
 */

/** A switch, as components/ui/switch draws one: the panel hands its own. */
export type ToggleProps = { checked: boolean; onCheckedChange: (on: boolean) => void; "aria-label": string; "aria-describedby"?: string }
export type RecapToGuestsProps = { on: boolean; set: (on: boolean) => Promise<unknown>; Toggle: ComponentType<ToggleProps> }

/** The organiser's switch: on as the event has it, saved as it flips, back as it was when the save fails. */
function RecapToGuests({ on, set, Toggle }: RecapToGuestsProps) {
  const [now, setNow] = useState(on)
  const helpId = useId()
  const flip = async (next: boolean) => {
    setNow(next)
    try {
      await set(next)
    } catch {
      setNow(!next)
    }
  }
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-foreground">Send the recap to guests</span>
        <span id={helpId} className="text-xs text-muted-foreground">
          Guests by email get each call&apos;s recap and action items, never its transcript or recording.
        </span>
      </div>
      <Toggle aria-label="Send the recap to guests" aria-describedby={helpId} checked={now} onCheckedChange={(v) => void flip(v)} />
    </div>
  )
}

export function EventRecordings({
  body,
  recap,
  recapToGuests,
  ...props
}: Omit<CallArtefactsProps, "calls" | "below"> & { body: unknown; recap?: RecapMeans; recapToGuests?: RecapToGuestsProps }) {
  const titleId = useId()
  const calls = readArtefacts(body)
  if (calls.length === 0 && !recapToGuests) return null
  return (
    <section aria-labelledby={titleId} className="mt-6 flex flex-col gap-2">
      <h3 id={titleId} className={sectionTitle}>Recordings & notes</h3>
      {recapToGuests && <RecapToGuests {...recapToGuests} />}
      {calls.length > 0 && <CallArtefacts calls={calls} {...props} below={(a) => <CallRecap callKey={a.key} recap={a.recap} items={a.action_items} means={recap} />} />}
    </section>
  )
}
