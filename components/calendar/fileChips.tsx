"use client"

import { EntityChip } from "@/components/liveEntity/EntityChip"
import { entityKind, useLiveEntity, useToday } from "@/lib/liveEntity"
import "@/lib/liveEntity/boardKind"
import { X } from "@/lib/icons"
import type { EventFile } from "@/lib/calendar/eventFiles"

/** Unlink, named as the reader reads the thing: by its title as its kind draws it, or that it was deleted. */
function RemoveFile({ file, onRemove }: { file: EventFile; onRemove: (file: EventFile) => void }) {
  const live = useLiveEntity<unknown>(file.kind, file.uuid)
  const spec = entityKind(file.kind)
  const today = useToday()
  const noun = spec?.noun ?? file.kind
  const title = live.state === "ok" && live.data !== undefined ? spec?.view(live.data, file.uuid, { today }).title : undefined
  const name = title || (live.state === "gone" ? `a deleted ${noun}` : `this ${noun}`)
  return (
    <button
      type="button"
      onClick={() => onRemove(file)}
      aria-label={`Remove ${name}`}
      title="Remove"
      data-touch-target=""
      className="-ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] text-ink-3 outline-none transition-colors duration-[140ms] hover:bg-press hover:text-ink focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:size-7"
    >
      <X className="size-3.5" aria-hidden="true" />
    </button>
  )
}

/**
 * What an event links, as chips (calendar head B, gcal-1a; EVLINK, gcal-15): a
 * doc, a board or a task, each named by the reader's own read (lib/liveEntity,
 * POST /entities), never by the event, which carries to each reader only what
 * they may open; a deleted one says so. A task's chip opens the task as all
 * that name one do: its panel on a computer, its page on a phone. onRemove,
 * for whoever may change the event, adds a remove beside each.
 */
export function FileChips({ files, onRemove }: { files: EventFile[]; onRemove?: (file: EventFile) => void }) {
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Linked">
      {files.map((f) => (
        <li key={`${f.kind}:${f.uuid}`} data-file={f.uuid} className="flex min-w-0 max-w-full items-center gap-0.5">
          <EntityChip kind={f.kind} id={f.uuid} className="min-h-7 items-center px-1.5 text-ui-sm" />
          {onRemove ? <RemoveFile file={f} onRemove={onRemove} /> : null}
        </li>
      ))}
    </ul>
  )
}
