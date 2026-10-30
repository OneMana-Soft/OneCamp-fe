"use client"

import * as React from "react"

import { prefetchUploads, uploadLater } from "@/components/docFiles/dropFiles"
import { carriesFiles } from "@/lib/utils/file/carriesFiles"
import { Upload } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { UploadPlace } from "@/services/docFilesService"

/**
 * A place files can be dropped from outside (docs F1b): an empty Docs &
 * Files, an empty folder. While files are over it a ring in the accent fades
 * in round it and a pill says where they'll go; a drop uploads them there.
 * Opacity and transform only, so nothing on the page moves.
 */
export function FileDropZone({ place, label, className, children }: { place: UploadPlace; label: string; className?: string; children: React.ReactNode }) {
  const [over, setOver] = React.useState(false)
  return (
    <div
      data-file-drop=""
      data-over={over || undefined}
      onDragOver={(e) => {
        if (!carriesFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        if (!over) {
          setOver(true)
          prefetchUploads()
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return
        e.preventDefault()
        setOver(false)
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length) uploadLater(files, place, label)
      }}
      className={cn("group/drop relative rounded-2xl", className)}
    >
      {children}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 inset-ring-2 inset-ring-brand transition-opacity duration-[160ms] ease-[var(--ease-out)] group-data-[over]/drop:opacity-100" />
      <span
        aria-live="polite"
        className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 translate-y-1 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-ui-sm font-medium text-white opacity-0 shadow-e2 transition-[opacity,transform] duration-[180ms] ease-[var(--ease-out)] group-data-[over]/drop:translate-y-0 group-data-[over]/drop:opacity-100"
      >
        <Upload className="size-3.5" aria-hidden="true" />
        {over ? `Drop to upload to ${label}` : ""}
      </span>
    </div>
  )
}
