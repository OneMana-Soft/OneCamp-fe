"use client"

// FilesCell: a files field's cell (tables B1, Airtable's attachments). Each
// file is a chip with its type's glyph and its name, opening it in the app's
// attachment viewer (the one chat's files open in), with the arrow keys
// between the cell's files. A "+" stores more through the one upload every
// attachment takes (lib/upload's uploadAttachment, its place the table), and
// an × takes one off the cell. On one line it shows the chips that fit whole,
// then "+N", which opens the list of them all. The cell keeps each file as
// {id, name, size, mime}; the server serves a file only to someone who may
// read the table's rows.

import * as React from "react"
import { useDispatch } from "react-redux"
import { FileTypeIcon } from "@/components/fileIcon/fileTypeIcon"
import { PopoverContent } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { useFitCount } from "@/hooks/useFitCount"
import { Plus, X } from "@/lib/icons"
import { formatLocale } from "@/lib/tables/numberFormat"
import { uploadAttachment } from "@/lib/upload"
import { cn } from "@/lib/utils/helpers/cn"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import { splitForMiddle } from "@/lib/utils/file/fileTypeHue"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { tableFilesUrl, type TableFile } from "@/services/tableService"
import { openUI } from "@/store/slice/uiSlice"
import type { AttachmentMediaReq } from "@/types/attachment"
import { LazyPopover } from "./LazyPopover"

/** A cell's value as its files, each once; anything else in it is no file. */
export function filesOf(value: unknown): TableFile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: TableFile[] = []
  for (const it of value) {
    if (!it || typeof it !== "object") continue
    const f = it as Partial<TableFile>
    if (typeof f.id !== "string" || !f.id || seen.has(f.id)) continue
    seen.add(f.id)
    out.push({ id: f.id, name: typeof f.name === "string" && f.name ? f.name : "File", size: typeof f.size === "number" ? f.size : undefined, mime: typeof f.mime === "string" ? f.mime : undefined })
  }
  return out
}

/** A file as the attachment viewer shows one. */
export function asMedia(f: TableFile): AttachmentMediaReq {
  return { attachment_uuid: f.id, attachment_file_name: f.name, attachment_type: getAttachmentType(f.name), attachment_size: f.size ?? 0, attachment_created_at: "", attachment_raw_type: f.mime }
}

/** A file's name, cut in the middle only when it must be: its start, and always its type. */
function FileName({ name }: { name: string }) {
  const [head, tail] = splitForMiddle(name, true)
  return (
    <>
      <span className="truncate">{head}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </>
  )
}

// The chip of a relation cell's links: one chip language for the grid. It
// takes the room its name needs, up to the cell's width.
const CHIP = "group/chip inline-flex h-[22px] min-w-0 max-w-full shrink-0 items-center gap-1 rounded-md bg-raised pl-1.5 pr-1.5 text-meta font-medium text-ink shadow-e1 transition-shadow hover:shadow-e2"
const REMOVE = "-mr-0.5 hidden size-4 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink group-hover/chip:inline-flex focus-visible:inline-flex [@media(hover:none)]:inline-flex"

export function FilesCell({
  value,
  tableId,
  room = { max: Infinity, wrap: true },
  readOnly,
  onCommit,
}: {
  value: unknown
  /** The table the files are of: where they're stored and served from. */
  tableId?: string
  /** Whether the chips wrap (the record panel, a tall row), and then how many show (gridCells' chipRoom). */
  room?: { max: number; wrap: boolean }
  readOnly?: boolean
  onCommit: (files: TableFile[]) => Promise<boolean>
}) {
  const { toast } = useToast()
  const dispatch = useDispatch()
  const files = filesOf(value)
  const input = React.useRef<HTMLInputElement>(null)
  const line = React.useRef<HTMLDivElement>(null)
  const [listOpen, setListOpen] = React.useState(false)
  // The files being stored, by name, and their progress.
  const [sending, setSending] = React.useState<{ name: string; pct: number }[]>([])
  const stop = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => stop.current?.abort(), [])
  const canWrite = !readOnly && !!tableId

  // On one line, the chips that fit whole (each measured as drawn), the "+"
  // after them kept clear; wrapping, as many as the row shows.
  const fit = useFitCount(line, files.length, files.map((f) => f.id + f.name).join("|"), { reserve: canWrite ? 24 : 0 })
  const shown = room.wrap ? Math.min(files.length, room.max) : fit
  const hidden = files.length - shown
  // On one line, a chip wider than the cell cuts its name, and leaves "+N"
  // and "+" their room.
  const chipWidth = room.wrap ? undefined : { maxWidth: `calc(100% - ${(hidden > 0 ? 36 : 0) + (canWrite ? 24 : 0)}px)` }

  const open = (f: TableFile) => {
    if (!tableId) return
    dispatch(openUI({ key: "attachmentLightbox", data: { media: asMedia(f), allMedia: files.map(asMedia), mediaGetUrl: tableFilesUrl(tableId) } }))
  }
  const remove = (f: TableFile) => void onCommit(files.filter((x) => x.id !== f.id))

  const add = async (picked: File[]) => {
    if (!tableId || picked.length === 0) return
    const ctl = new AbortController()
    stop.current = ctl
    setSending(picked.map((f) => ({ name: f.name, pct: 0 })))
    const stored: TableFile[] = []
    let failed = 0
    for (const [i, file] of picked.entries()) {
      try {
        const id = await uploadAttachment({ key: "table", value: tableId }, file, (pct) => setSending((s) => s.map((x, j) => (j === i ? { ...x, pct } : x))), ctl.signal)
        stored.push({ id, name: file.name, size: file.size, mime: file.type || undefined })
      } catch {
        if (ctl.signal.aborted) return
        failed++
      }
    }
    setSending([])
    if (stored.length) await onCommit([...files, ...stored])
    if (failed) toast({ title: failed === 1 ? "A file wasn't added" : `${formatLocale(failed, {})} files weren't added`, description: "Try them again in a moment.", variant: "destructive" })
  }

  return (
    <div ref={line} className={cn("relative flex h-full min-h-8 items-center gap-1 px-3", room.wrap ? "flex-wrap content-center py-1" : "overflow-hidden")}>
      {files.slice(0, shown).map((f) => (
        <span key={f.id} data-file-chip="" data-fit-item="" className={CHIP} style={chipWidth}>
          <FileTypeIcon name={f.name} fileType={f.mime} size={14} />
          <button
            type="button"
            onClick={() => open(f)}
            disabled={!tableId}
            aria-label={f.name}
            className="flex min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title={f.size ? `Open ${f.name} (${formatFileSizeForAttachment(f.size)})` : `Open ${f.name}`}
          >
            <FileName name={f.name} />
          </button>
          {canWrite && (
            <button type="button" onClick={() => remove(f)} className={REMOVE} title="Remove" aria-label={`Remove ${f.name}`}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {hidden > 0 ? (
        <LazyPopover
          open={listOpen}
          onOpenChange={setListOpen}
          trigger={
            <button
              type="button"
              data-file-more=""
              className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-raised px-1.5 text-meta tabular-nums text-ink-3 shadow-e1 transition-shadow hover:text-ink hover:shadow-e2"
              aria-label={`All ${formatLocale(files.length, {})} files`}
              title={files
                .slice(shown)
                .map((f) => f.name)
                .join(", ")}
            >
              +{formatLocale(hidden, {})}
            </button>
          }
        >
          <PopoverContent align="start" sideOffset={2} className="content-float w-72 rounded-xl p-1 shadow-e3">
            <ul className="max-h-72 overflow-y-auto" data-files-list="">
              {files.map((f) => (
                <li key={f.id} className="group/chip flex h-9 items-center gap-2 rounded-md px-2 hover:bg-hover">
                  <FileTypeIcon name={f.name} fileType={f.mime} size={16} />
                  <button type="button" onClick={() => open(f)} aria-label={f.name} className="flex min-w-0 flex-1 text-left text-ui-sm text-ink">
                    <FileName name={f.name} />
                  </button>
                  {f.size ? <span className="shrink-0 text-meta tabular-nums text-ink-3">{formatFileSizeForAttachment(f.size)}</span> : null}
                  {canWrite && (
                    <button type="button" onClick={() => remove(f)} className={REMOVE} title="Remove" aria-label={`Remove ${f.name}`}>
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </LazyPopover>
      ) : null}
      {sending.map((s, i) => (
        <span key={`sending-${i}`} data-file-sending="" className="inline-flex h-[22px] min-w-0 max-w-full items-center gap-1 rounded-md bg-hover px-1.5 text-meta text-ink-3">
          <span className="truncate">{s.name}</span>
          <span className="shrink-0 tabular-nums">{formatLocale(s.pct, {})}%</span>
        </span>
      ))}
      {canWrite && sending.length === 0 ? (
        <>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            data-file-input=""
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              e.target.value = ""
              void add(picked)
            }}
          />
          <button
            type="button"
            aria-label="Add files"
            onClick={() => input.current?.click()}
            className={cn(
              "inline-flex h-5 shrink-0 items-center justify-center gap-0.5 rounded-md text-meta text-ink-3 opacity-0 pointer-events-none transition-opacity hover:bg-hover hover:text-ink group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
              files.length > 0 ? "w-5" : "px-1",
            )}
          >
            <Plus className="size-3" /> {files.length === 0 ? "Add" : ""}
          </button>
        </>
      ) : null}
    </div>
  )
}
