"use client"

import * as React from "react"

import { ChromeSheet } from "@/components/docEditor/chrome/Sheet"
import { InlineError } from "@/components/docEditor/chrome/parts"
import { ImportDropZone } from "@/components/common/importDropZone"
import { tooBig } from "@/components/docFiles/uploads"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { uploadDocFileVersion } from "@/services/docFilesService"

/**
 * Replace with a new version (docs F1b): the file's next version, with what
 * changed. Everyone sees the new one where the file is; the old ones stay in
 * See all versions. The upload's progress fills a bar under the file
 * (a transform, not a width), and a failure is said in place.
 */
export function ReplaceVersionDialog({ file, onClose }: { file: { id: string; title: string }; onClose: () => void }) {
  const [chosen, setChosen] = React.useState<File | null>(null)
  const [note, setNote] = React.useState("")
  const [pct, setPct] = React.useState<number | null>(null)
  const [error, setError] = React.useState("")
  const busy = pct !== null
  const name = file.title.trim() || "this file"
  // Closing while it uploads (Cancel, Escape, the scrim) stops the upload, so
  // nothing more is sent and no toast says it became a version.
  const sending = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => sending.current?.abort(), [])
  const close = () => {
    sending.current?.abort()
    onClose()
  }

  const upload = async () => {
    if (!chosen || busy) return
    const why = tooBig(chosen)
    if (why) {
      setError(why)
      return
    }
    setError("")
    setPct(0)
    const request = new AbortController()
    sending.current = request
    try {
      const version = await uploadDocFileVersion(file.id, chosen, note, { onProgress: setPct, signal: request.signal })
      if (request.signal.aborted) return
      toast({ title: `“${name}” is now version ${version.n}`, description: note.trim() || undefined })
      onClose()
    } catch (e) {
      if (request.signal.aborted) return
      setPct(null)
      setError(apiErrorMessage(e, "The new version didn't upload. Try again in a moment."))
    }
  }

  return (
    <ChromeSheet
      onClose={close}
      title="Replace with a new version"
      description={`Everyone sees the new version of “${name}”. The earlier ones stay in See all versions.`}
      data-replace-version-dialog=""
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} disabled={!chosen} onClick={() => void upload()} aria-label="Upload new version" className="tabular-nums">
            {busy ? `Uploading… ${pct}%` : "Upload new version"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <ImportDropZone
          multiple={false}
          chosen={chosen}
          onFiles={(files) => {
            const f = files?.[0]
            if (!f) return
            setChosen(f)
            setError("")
          }}
          label="Choose the new version"
        />
        {busy ? (
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-sm bg-press">
            <span className="block h-full origin-left rounded-sm bg-brand transition-transform duration-200 ease-[var(--ease-out)]" style={{ transform: `scaleX(${(pct ?? 0) / 100})` }} />
          </span>
        ) : null}
      </div>
      <Field label="What changed (optional)" help="Shown with this version in See all versions.">
        <Textarea rows={2} maxLength={280} value={note} placeholder="Signed by the client" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}
