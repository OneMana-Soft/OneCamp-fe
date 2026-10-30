"use client"

import * as React from "react"
import { FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { carriesFiles } from "@/lib/utils/file/carriesFiles"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Where files are dropped, or chosen with the browser's chooser (its control
 * stays hidden): every import dialog's (docs, calendars, the CSV import), and
 * Docs & Files' new version, which chooses its one file here. It takes only a
 * drag that carries files. With one file at a time, the file chosen shows in
 * it, its name and size, with Choose another. A module of its own, so the new
 * version's dialog doesn't carry the import rows and their jobs' code.
 *
 * The ref is its button, so a form can send the focus to it ("Choose the CSV
 * file to import."). In a Field, the label points at the button and its help
 * and error describe it; the button is still named by its own words, so what
 * it says is what a voice user says.
 */
type ImportDropZoneProps = {
  /** The types it takes; any file when absent. */
  accept?: string[]
  multiple?: boolean
  onFiles: (files: FileList | null) => void
  label?: string
  /** The file chosen, one at a time. */
  chosen?: File | null
  /** While true, the button takes no press and the zone no drop (an upload under way). */
  disabled?: boolean
  /** From a Field: its label's target and its help and error lines, put on the button. */
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

export const ImportDropZone = React.forwardRef<HTMLButtonElement, ImportDropZoneProps>(function ImportDropZone(
  { accept, multiple = true, onFiles, label = "Choose files", chosen, disabled = false, id, "aria-describedby": describedBy, "aria-invalid": invalid },
  ref,
) {
  const [dragging, setDragging] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const words = React.useId()
  const choose = () => input.current?.click()
  // Shared by both buttons (the label, and Choose another). The type, variant
  // and size are written on each Button, where the overlay guards read them.
  const button = {
    ref,
    id,
    "aria-labelledby": words,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    disabled,
    onClick: choose,
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm transition-colors",
        chosen && "px-3 py-3",
        dragging && "border-primary bg-hover",
        invalid && "border-danger-ink",
      )}
      onDragOver={(e) => {
        if (!carriesFiles(e)) return
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!carriesFiles(e)) return
        e.preventDefault()
        setDragging(false)
        if (!disabled) onFiles(e.dataTransfer.files)
      }}
    >
      {chosen ? (
        <div className="flex w-full items-center gap-3 text-left">
          <FileGlyph name={chosen.name} fileType={chosen.type} size={40} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-ui font-medium text-ink">{chosen.name}</span>
            <span className="truncate text-meta tabular-nums text-ink-3">{formatFileSizeForAttachment(chosen.size)}</span>
          </span>
          <Button type="button" variant="outline" size="sm" {...button}>
            <span id={words}>Choose another</span>
          </Button>
        </div>
      ) : (
        <>
          <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground pointer-coarse:hidden">Drop {multiple ? "files" : "a file"} here, or</p>
          <Button type="button" variant="outline" size="sm" {...button}>
            <span id={words}>{label}</span>
          </Button>
        </>
      )}
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={accept?.join(",")}
        className="hidden"
        data-import-input=""
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
})
