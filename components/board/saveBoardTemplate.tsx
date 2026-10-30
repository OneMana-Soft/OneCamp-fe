"use client"

// Save this board as a template for the workspace (miro-19 3): its notes,
// frames and shapes, listed on the Templates page and in every board's
// template picker under "Your team's". A board's pictures stay with it (their
// files are the board's own), and a note's task stays with the board it was
// made on (lib/board/copyElements, templateElements).

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { appMutate } from "@/lib/swrMutate"
import { boardTemplatesKey, publishTemplate } from "@/services/marketplaceService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { templateElements, type CopyableElement } from "@/lib/board/copyElements"
import { BOARD_TEMPLATE_MAX_BYTES, boardTemplatePayload } from "@/lib/board/teamTemplates"

const kb = (bytes: number) => `${Math.ceil(bytes / 1024).toLocaleString()} KB`

export default function SaveBoardTemplate({ api, title, onClose }: { api: ExcalidrawImperativeAPI; title: string; onClose: () => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState(title.trim() || "Untitled board")
  const [description, setDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  // The board as it is when the dialog opens.
  const scene = React.useMemo(() => api.getSceneElements() as unknown as CopyableElement[], [api])
  const elements = React.useMemo(() => templateElements(scene), [scene])
  const pictures = scene.some((e) => e.type === "image" && !e.isDeleted)
  // What the board weighs is read once; a name typed adds only its own bytes
  // (the payload with an empty title, its two quotes taken back).
  const boardBytes = React.useMemo(() => boardTemplatePayload("", elements).bytes - 2, [elements])
  const bytes = boardBytes + new TextEncoder().encode(JSON.stringify(name.trim())).length
  const tooBig = bytes > BOARD_TEMPLATE_MAX_BYTES
  const ready = !busy && !!name.trim() && elements.length > 0 && !tooBig

  const save = async () => {
    if (!ready) return
    setBusy(true)
    setError("")
    try {
      await publishTemplate({ kind: "board", name: name.trim(), description: description.trim(), payload: boardTemplatePayload(name, elements).payload })
      // Every picker and the Templates page list it at once.
      void appMutate(boardTemplatesKey)
      toast({ title: "Saved to Templates", description: "Anyone in the workspace can start a board from it." })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, "The template couldn't be saved just now. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      title="Save as a template"
      description="The board's notes, frames and shapes, for anyone in the workspace to start from."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!ready} className="gap-1.5" data-save-board-template="">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Save template
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-ui-sm font-medium text-ink">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Template name" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-ui-sm font-medium text-ink">What it&apos;s for</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} aria-label="What it's for" placeholder="A retro for the end of each sprint" />
        </label>
        <p className="text-ui-sm text-ink-3" data-template-contents="">
          {elements.length === 0
            ? "There's nothing on the board to save yet."
            : `${elements.length.toLocaleString()} ${elements.length === 1 ? "thing" : "things"} from the board.${pictures ? " Pictures stay with the board." : ""}`}
        </p>
        {tooBig && (
          <p role="alert" className="text-ui-sm text-danger-ink">
            {`This board comes to ${kb(bytes)}, and a template holds ${kb(BOARD_TEMPLATE_MAX_BYTES)}. Save a smaller board as the template.`}
          </p>
        )}
        {error && (
          <p role="alert" className="text-ui-sm text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  )
}
