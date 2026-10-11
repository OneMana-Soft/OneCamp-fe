"use client"

// A drop zone for a credential file (design v3, admin A7): 120px, r12, a
// dashed 1.5px --line-3 edge, a centred upload glyph and one line, with
// "Paste instead" for a key that is on the clipboard rather than on disk.
// Dragged over, its ring goes brand 50 % with the halo and the glyph lifts
// 2px (transform only, app/styles/admin/config.css). It replaced a 140px
// textarea that asked an admin to paste a private key into a page.

import * as React from "react"
import { useId, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Upload } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** What a service-account file says about itself, or why it isn't one. Pure. */
export function readServiceAccount(text: string): { ok: true; project: string; email: string } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: "That isn't JSON. Choose the file Firebase downloaded." }
  }
  const o = (parsed ?? {}) as Record<string, unknown>
  if (o.type !== "service_account") return { ok: false, reason: "That JSON isn't a service-account key." }
  return { ok: true, project: String(o.project_id ?? ""), email: String(o.client_email ?? "") }
}

export function CredentialDropZone({
  value,
  onChange,
  label = "Drop the service-account JSON, or choose a file",
}: {
  /** The credential's text, as read from the file or pasted. */
  value: string
  onChange: (text: string, fileName?: string) => void
  label?: string
}) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [fileName, setFileName] = useState("")

  const take = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    setFileName(file.name)
    onChange(text, file.name)
  }

  if (pasting) {
    return (
      <div className="space-y-2">
        <Textarea
          aria-label="Service-account JSON"
          autoFocus
          rows={6}
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='{"type": "service_account", "project_id": "…"}'
          className="font-mono text-2xs"
        />
        <button
          type="button"
          onClick={() => setPasting(false)}
          className="rounded-sm text-xs font-medium text-brand-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Choose a file instead
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        data-drop-zone=""
        data-drag={drag ? "true" : undefined}
        onDragEnter={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDrag(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void take(e.dataTransfer.files?.[0])
        }}
        className="cfg-drop"
      >
        {fileName && value ? (
          <>
            <FileText className="cfg-drop-glyph size-5 text-ink-3" aria-hidden="true" />
            <span className="max-w-full truncate px-4 text-sm font-medium text-foreground">{fileName}</span>
            <span className="text-xs text-muted-foreground">Drop another file, or choose one, to change it</span>
          </>
        ) : (
          <>
            <Upload className="cfg-drop-glyph size-5 text-ink-3" aria-hidden="true" />
            <span className="px-4 text-center text-sm text-muted-foreground">{label}</span>
          </>
        )}
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            void take(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => setPasting(true)}
        className={cn("rounded-sm text-xs font-medium text-brand-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
      >
        Paste instead
      </button>
    </div>
  )
}
