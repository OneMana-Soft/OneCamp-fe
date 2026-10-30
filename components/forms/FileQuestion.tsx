"use client"

// A question that takes files (package 9 R4b), on a public form's page and in
// its builder's preview: a place to drop files or pick them, and each file
// with its kind, its size, how far it has got and what went wrong with it.
// The page (FormPages) keeps the files and sends each one as it is picked.

import { useId, useRef, useState } from "react"
import { Check, Upload, X } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { Tile } from "@/components/ui/graphics/Tile"
import { Bar } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { MiddleName } from "@/components/ui/middleName"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"

/** A file picked for a question: on its way, kept (with its upload's id), or left out (with why). */
export interface PickedFile {
  key: string
  name: string
  size: number
  mime: string
  /** 0 to 100 while it goes. */
  progress: number
  /** The upload's id, once the server has kept it. */
  id?: string
  /** Why it was left out. */
  error?: string
  /** A picture's object URL (the visitor's own file, shown in place of its glyph). */
  thumb?: string
}

/** Whether a file is still on its way. */
export const sending = (f: PickedFile) => !f.id && !f.error

export function FileQuestion({
  id,
  label,
  help,
  problem,
  hue,
  files,
  max,
  mb,
  note,
  onPick,
  onRemove,
}: {
  /** The question's control id: the button that adds files. */
  id: string
  label: React.ReactNode
  help?: React.ReactNode
  problem?: React.ReactNode
  hue: CampHue
  files: PickedFile[]
  max: number
  mb: number
  /** A line under the files: those left out for want of room. */
  note?: string
  onPick: (files: File[]) => void
  onRemove: (key: string) => void
}) {
  const uid = useId()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const room = files.length < max
  const labelId = `${id}-label`
  const limits = `${uid}-limits`
  const take = (list: FileList | null) => {
    if (list?.length) onPick(Array.from(list))
  }
  return (
    <div className={cn(HUE_CLASS[hue], "grid gap-1.5")} role="group" aria-labelledby={labelId} data-form-files="">
      <p id={labelId} className="flex items-baseline justify-between gap-2 text-ui-sm font-medium text-foreground">{label}</p>
      {help}
      {room && (
        <div
          data-form-drop=""
          data-over={over ? "" : undefined}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files)
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-sunken px-4 py-5 text-center transition-colors duration-200",
            over && "border-[var(--hue)] [background:color-mix(in_oklab,var(--hue)_8%,var(--sunken))]",
          )}
        >
          <Tile hue={hue} size="md" className={cn("transition-transform duration-200", over && "scale-110")}><Upload /></Tile>
          <p className="text-ui-sm text-ink-2">
            <span className="max-sm:hidden">Drop files here, or </span>
            <Button type="button" variant="secondary" id={id} aria-describedby={limits} data-touch-target="" className="mt-1 h-11 gap-1.5 sm:mt-0 sm:h-8"
              onClick={() => input.current?.click()}>
              Add files
            </Button>
          </p>
          <p id={limits} className="text-meta tabular-nums text-ink-3">Up to {max} files, {mb} MB each</p>
          <input ref={input} type="file" multiple data-form-file-input="" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => {
              take(e.target.files)
              e.target.value = ""
            }} />
        </div>
      )}
      {files.length > 0 && (
        <ul aria-label="Files" className="grid grid-cols-1 gap-1.5">
          {files.map((f) => (
            <li key={f.key} aria-label={f.name} data-form-file={f.error ? "refused" : f.id ? "kept" : "sending"}
              className="flex items-center gap-3 rounded-lg bg-raised px-2.5 py-2 shadow-e1 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              {f.thumb ? <Thumb file={f} /> : <FileGlyph name={f.name} fileType={f.mime} size={32} />}
              <span className="min-w-0 flex-1">
                <MiddleName name={f.name} className="text-ui-sm font-medium text-ink" />
                {f.error ? (
                  <span className="block text-meta text-danger-ink">{f.error}</span>
                ) : f.id ? (
                  <span className="flex items-center gap-1 text-meta tabular-nums text-ink-3">
                    <Check aria-hidden="true" className="hue-moss size-3.5 text-hue" />
                    {formatFileSizeForAttachment(f.size)}
                  </span>
                ) : (
                  <Bar className="mt-1.5" size={4} value={f.progress} label={`Sending ${f.name}`} doneAtFull={false} />
                )}
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-ink-3 md:size-8" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.key)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-meta text-ink-2">{note}</p>}
      {problem}
    </div>
  )
}

/**
 * A picture the visitor picked, on the tile a picture's glyph sits on (so a
 * transparent one shows the tile), or the glyph when the browser can't draw
 * it.
 */
function Thumb({ file }: { file: PickedFile }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <FileGlyph name={file.name} fileType={file.mime} size={32} />
  return (
    <span aria-hidden="true" data-file-thumb="" className="inline-flex size-8 shrink-0 overflow-hidden rounded-[9px] bg-sunken ring-1 ring-inset ring-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- the visitor's own file, an object URL */}
      <img src={file.thumb} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
    </span>
  )
}
