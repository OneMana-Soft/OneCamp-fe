"use client"

// A project's or a team's docs (docs programme B5, structure.md P1.9): the
// pages made in its space, as a tree, with New doc and From a template…
// making the next one there. A project's Docs tab and the team page's Docs
// card draw it; each loads it as a chunk of its own, when it is shown.
//
// On a project it draws in the frame every project tab does
// (components/task/workFrame): its two buttons in the 44 px band flush under
// the tabs, the one primary, New doc, at its end, and the pages 20 px under
// it at the tab's edge, so switching from Files to Docs moves nothing. They
// were a centred column with its buttons floating over it. The buttons are
// there from the first paint, empty or not, so New doc never moves.
//
// Docs & Files (docs F1b): "▾" beside New doc adds a folder, files or a link
// to the space's top; its rows can be chosen together and coloured or moved
// at once; files dropped on it, on its rows or while it's empty, upload to
// the space (or the folder they're dropped on).

import * as React from "react"

import { readLimit, useTreeLevel } from "@/components/tree/useTree"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { DocTree, adapterFor } from "@/components/docTree/DocTree"
import { DocTreeSkeleton } from "@/components/docTree/DocsSection"
import { SpaceDocsCardHeader } from "@/components/docTree/SpaceDocsCard"
import { FileDropZone } from "@/components/docFiles/FileDropZone"
import { NewSplitButton } from "@/components/docFiles/NewMenu"
import { useFilePicker } from "@/components/docFiles/useFilePicker"
import { useNodeDialogs } from "@/components/docFiles/useNodeDialogs"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SpotDocs, Tile } from "@/components/ui/graphics"
import { areaHue } from "@/lib/areas"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { QUICK_DOC_TEMPLATES, templateGlyph } from "@/lib/docTemplates"
import { LayoutTemplate, Loader2 } from "@/lib/icons"
import type { DocSpace } from "@/types/docGraph"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const TemplatePicker = lazyPiece(() => import("@/components/docTemplates/TemplatePicker"))

/** A page shows this many of a level before "Show more". */
const PAGE_CAP = 50

/** What a space is called in a sentence: "this project", "this team". Pure. */
export const spaceWord = (space: DocSpace) => (space.startsWith("team:") ? "team" : "project")

function Empty({
  space,
  name,
  create,
  busy,
}: {
  space: DocSpace
  name?: string
  create: ReturnType<typeof useCreateDoc>["create"]
  busy: string | null
}) {
  return (
    <div data-space-docs-empty="" className="flex flex-col items-center px-6 py-10 text-center">
      <span data-empty-illustration="">
        <SpotDocs size={96} hue={areaHue("docs")} />
      </span>
      <h3 className="mt-4 text-heading text-ink">No docs or files in this {spaceWord(space)} yet</h3>
      <p className="mt-1 max-w-[45ch] text-ui text-ink-2">
        {`Plans, specs, files and links for ${name ?? `this ${spaceWord(space)}`} go here. Drop files here to upload them.`}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {QUICK_DOC_TEMPLATES.map((t) => {
          const Glyph = templateGlyph(t.glyph)
          return (
            <button
              key={t.id}
              type="button"
              data-template-row={t.id}
              disabled={!!busy}
              onClick={() => void create({ templateId: t.id, title: t.name, space, busyKey: t.id })}
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-ui-sm text-ink shadow-e1 outline-none transition-shadow hover:shadow-e2 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              <Tile hue={t.hue} size="sm" className="size-4 rounded-[5px] [&>svg]:size-2.5">
                {busy === t.id ? <Loader2 className="animate-spin" /> : <Glyph />}
              </Tile>
              {t.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function SpaceDocs({ space, name, variant = "tab" }: { space: DocSpace; name?: string; variant?: "tab" | "card" }) {
  const { create, busy } = useCreateDoc()
  const dialogs = useNodeDialogs()
  const picker = useFilePicker()
  // Where things land, as an upload's toast says it.
  const place = name ?? `this ${spaceWord(space)}`
  const [templates, setTemplates] = React.useState(false)
  // What the tree asks for, so the two share one answer (fluid-06, Fix 2).
  const { level, loading } = useTreeLevel(adapterFor(space), null, readLimit(PAGE_CAP))
  const empty = !!level && level.nodes.length === 0 && level.hidden === 0
  const busyKey = `space:${space}`
  const newDoc = () => void create({ space, busyKey })
  const card = variant === "card"

  // From a template…, then the one primary at the end. A card's column is
  // narrow (three to the team page), so there From a template is its icon.
  const template = (
    <Button
      size={card ? "icon-sm" : "sm"}
      variant="secondary"
      onClick={() => setTemplates(true)}
      disabled={!!busy}
      aria-label="From a template"
      className={card ? undefined : "gap-1.5"}
    >
      <LayoutTemplate className="size-3.5" aria-hidden="true" />
      {card ? null : <span className="max-sm:sr-only">From a template</span>}
    </Button>
  )
  const actions = (
    <div className="flex items-center gap-1.5">
      {card ? (
        <Tooltip>
          <TooltipTrigger asChild>{template}</TooltipTrigger>
          <TooltipContent>From a template</TooltipContent>
        </Tooltip>
      ) : (
        template
      )}
      <NewSplitButton
        running={busy}
        own={busyKey}
        onPage={newDoc}
        onFolder={() => dialogs.open({ kind: "folder", place: { space } })}
        onUpload={() => picker.pick({ space }, place)}
        onLink={() => dialogs.open({ kind: "link", place: { space } })}
      />
    </div>
  )

  const body = loading ? (
    <DocTreeSkeleton rows={4} />
  ) : empty ? (
    <WorkState>
      <FileDropZone place={{ space }} label={place}>
        <Empty space={space} name={name} create={create} busy={busy} />
      </FileDropZone>
    </WorkState>
  ) : (
    <DocTree
      space={space}
      label={name ? `${name}'s docs` : "Docs"}
      dense={false}
      cap={PAGE_CAP}
      selectable
      dropRoot={{ place: { space }, label: place }}
      moveStart={[{ id: null, title: name ?? `This ${spaceWord(space)}` }]}
    />
  )

  const picking = (
    <>
      {picker.element}
      {dialogs.element}
      {templates && (
        <React.Suspense fallback={null}>
          <TemplatePicker mode={{ kind: "create", space }} onClose={() => setTemplates(false)} />
        </React.Suspense>
      )}
    </>
  )

  if (card) {
    return (
      <Card className="flex h-full min-h-0 w-full flex-col border-none bg-transparent shadow-none" data-space-docs={space}>
        <SpaceDocsCardHeader>{actions}</SpaceDocsCardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">{body}</CardContent>
        {picking}
      </Card>
    )
  }

  return (
    <div className="flex flex-col pb-10" data-space-docs={space}>
      <div data-work-toolbar="" className={workToolbar}>
        <div className="ml-auto">{actions}</div>
      </div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="max-w-[720px]">{body}</div>
      </div>
      {picking}
    </div>
  )
}
