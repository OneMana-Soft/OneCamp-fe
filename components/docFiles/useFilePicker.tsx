"use client"

import * as React from "react"

import { prefetchUploads, uploadLater } from "./dropFiles"
import type { UploadPlace } from "@/services/docFilesService"

/**
 * Upload files… from a menu (docs F1b): the browser's file chooser, opened by
 * the app's own buttons (its control stays hidden), and what is chosen
 * uploaded into the place asked for. Render input where the surface is.
 */
export function useFilePicker() {
  const input = React.useRef<HTMLInputElement>(null)
  const into = React.useRef<{ place: UploadPlace; label: string } | null>(null)
  const pick = React.useCallback((place: UploadPlace, label: string) => {
    into.current = { place, label }
    // The upload's code comes while the chooser is open.
    prefetchUploads()
    input.current?.click()
  }, [])
  const element = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      tabIndex={-1}
      aria-hidden="true"
      data-upload-input=""
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ""
        const to = into.current
        if (files.length && to) uploadLater(files, to.place, to.label)
      }}
    />
  )
  return { pick, element }
}
