import { useId } from "react"
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
 * Make task given the panel's means (recap). It only presents: the panel
 * fetches, deletes and offers Undo, as this lazy chunk takes none of the
 * shared core.
 */

export function EventRecordings({ body, recap, ...props }: Omit<CallArtefactsProps, "calls" | "below"> & { body: unknown; recap?: RecapMeans }) {
  const titleId = useId()
  const calls = readArtefacts(body)
  if (calls.length === 0) return null
  return (
    <section aria-labelledby={titleId} className="mt-6 flex flex-col gap-2">
      <h3 id={titleId} className={sectionTitle}>Recordings & notes</h3>
      <CallArtefacts calls={calls} {...props} below={(a) => <CallRecap callKey={a.key} recap={a.recap} items={a.action_items} means={recap} />} />
    </section>
  )
}
