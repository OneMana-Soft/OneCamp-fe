"use client"

// Choosing a board template (miro-19): the workspace's own (Your team's) and
// the whole library, found by name, by what it's for, by who saved it or by
// kind, each drawn small from its real layout, and used in one press: laid on
// the board where the person is looking, or a new board made from it on the
// boards list. The shell is the one every template picker uses
// (components/templates/TemplateGallery); loaded only when the picker opens.

import * as React from "react"
import { TemplateGallery } from "@/components/templates/TemplateGallery"
import { TemplatePreview } from "@/components/board/templatePreview"
import { ShapesPreview } from "@/components/board/shapesPreview"
import { ALL_BOARD_TEMPLATES } from "@/lib/board/templateLibrary"
import { isTeamPick, teamBoardItems, type BoardPick } from "@/lib/board/teamTemplates"
import { useFetch } from "@/hooks/useFetch"
import { boardTemplatesKey, type MarketplaceTemplate } from "@/services/marketplaceService"
import { Loader2 } from "@/lib/icons"

/** A pick drawn small: a library template from its skeleton, a team's from the server's drawing of it. */
function Drawing({ t, height, pad, className }: { t: BoardPick; height: number; pad: number; className?: string }) {
  return isTeamPick(t) ? (
    <ShapesPreview shapes={t.shapes} id={t.id} height={height} pad={pad} className={className} />
  ) : (
    <TemplatePreview template={t} height={height} pad={pad} className={className} />
  )
}

export default function TemplatePicker({
  onUse,
  description = "It goes on the board where you're looking, as notes and frames you can change.",
  onClose,
}: {
  /** What using a template does: lays it on the board, or makes a board from it. */
  onUse: (t: BoardPick) => unknown
  description?: string
  onClose: () => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState("")
  // The workspace's own come first; the library is there at once, and they join it when they arrive.
  const { data } = useFetch<{ data: MarketplaceTemplate[] }>(boardTemplatesKey)
  const items = React.useMemo<BoardPick[]>(() => [...teamBoardItems(data?.data), ...ALL_BOARD_TEMPLATES], [data])

  const choose = async (t: BoardPick) => {
    if (busy) return
    setBusy(t.id)
    setError("")
    try {
      await onUse(t)
      onClose()
    } catch {
      setError("The template couldn't be used just now. Try again in a moment.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <TemplateGallery
      items={items}
      title="Start from a template"
      description={description}
      tile={(t, o) => (
        <span className="relative block h-9 w-12 shrink-0 overflow-hidden rounded-md bg-sunken shadow-e1" aria-hidden="true">
          {o.busy ? (
            <span className="absolute inset-0 flex items-center justify-center text-ink-3">
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : (
            <Drawing t={t} height={36} pad={4} />
          )}
        </span>
      )}
      preview={(t) => (
        <div className="group/tpl h-full overflow-hidden rounded-lg bg-sunken p-4" data-board-template-preview={t.id}>
          <Drawing t={t} height={340} pad={18} className="rounded-md" />
        </div>
      )}
      words={(t) => t.keywords ?? ""}
      busy={busy}
      failure={
        error ? (
          <p role="alert" className="px-1 text-ui-sm text-danger-ink">
            {error}
          </p>
        ) : undefined
      }
      onChoose={(t) => void choose(t)}
      onClose={onClose}
    />
  )
}
