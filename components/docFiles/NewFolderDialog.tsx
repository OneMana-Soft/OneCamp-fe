"use client"

import * as React from "react"

import { ChromeSheet } from "@/components/docEditor/chrome/Sheet"
import { InlineError } from "@/components/docEditor/chrome/parts"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { isComposingKey } from "@/lib/keys/ime"
import { Loader2 } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { createFolder, type NodePlace } from "@/services/docFilesService"

/**
 * New folder (docs F1b): a name, then Create. A folder takes its parent's
 * access, as a page made there does, and appears in the tree as it's made.
 */
export function NewFolderDialog({ place, onClose }: { place: NodePlace; onClose: () => void }) {
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const ready = name.trim().length > 0 && !busy

  const create = async () => {
    if (!ready) return
    setBusy(true)
    setError("")
    try {
      await createFolder(name, place)
      onClose()
    } catch (e) {
      setError(apiErrorMessage(e, "The folder wasn't made. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChromeSheet
      onClose={onClose}
      title="New folder"
      description="Keep files, links and pages that go together in one place."
      data-new-folder-dialog=""
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => void create()} aria-label="Create folder" className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Create
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input
          autoFocus
          value={name}
          maxLength={200}
          placeholder="Contracts"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isComposingKey(e.nativeEvent)) {
              e.preventDefault()
              void create()
            }
          }}
        />
      </Field>
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}
