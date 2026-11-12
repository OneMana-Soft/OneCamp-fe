"use client"

import { PlaceLine } from "@/components/calendar/placeLine"
import { FileChips } from "@/components/calendar/fileChips"
import { filesOf } from "@/lib/calendar/eventFiles"
import { fieldLabel, fieldRow, sectionTitle } from "@/lib/ui/fieldRow"

/**
 * What an event's own page reads beside its details (calendar head B,
 * gcal-1a): its place as a line that opens a map or its link, and what it
 * links (docs, boards, tasks) as chips named by the reader's own read. In the edit kit's chunk (panelEdit), which the page fetches when
 * idle, so the page's first load carries neither: one at a time, `place` as a
 * details row, `files` (the event as the calendar's API sent it) as a section.
 */
export function EventExtra({ place, files }: { place?: string; files?: unknown }) {
  if (place?.trim()) {
    return (
      <div className={fieldRow()} data-event-place="">
        <dt className={fieldLabel}>Place</dt>
        <dd className="flex min-h-8 min-w-0 items-center">
          <PlaceLine place={place} />
        </dd>
      </div>
    )
  }
  const list = filesOf({ files })
  if (!list.length) return null
  return (
    <section className="mt-6 space-y-2" data-event-files="">
      <h3 className={sectionTitle}>Linked</h3>
      <FileChips files={list} />
    </section>
  )
}
