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

import * as React from "react"

import { useTreeLevel } from "@/components/tree/useTree"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { DocTree, adapterFor } from "@/components/docTree/DocTree"
import { DocTreeSkeleton } from "@/components/docTree/DocsSection"
import { SpaceDocsCardHeader } from "@/components/docTree/SpaceDocsCard"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SpotDocs, Tile } from "@/components/ui/graphics"
import { areaHue } from "@/lib/areas"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { QUICK_DOC_TEMPLATES, templateGlyph } from "@/lib/docTemplates"
import { LayoutTemplate, Loader2, Plus } from "@/lib/icons"
import type { DocSpace } from "@/types/docGraph"

const TemplatePicker = React.lazy(() => import("@/components/docTemplates/TemplatePicker"))

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
      <h3 className="mt-4 text-heading text-ink">No docs in this {spaceWord(space)} yet</h3>
      <p className="mt-1 max-w-[45ch] text-ui text-ink-2">
        {name ? `Plans, specs and meeting notes for ${name} go here.` : `Plans, specs and meeting notes for this ${spaceWord(space)} go here.`}
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
  const [picker, setPicker] = React.useState(false)
  const { level, loading } = useTreeLevel(adapterFor(space), null, PAGE_CAP)
  const empty = !!level && level.nodes.length === 0 && level.hidden === 0
  const newDoc = () => void create({ space, busyKey: `space:${space}` })
  const card = variant === "card"

  // From a template…, then the one primary at the end. A card's column is
  // narrow (three to the team page), so there From a template is its icon.
  const template = (
    <Button
      size={card ? "icon-sm" : "sm"}
      variant="secondary"
      onClick={() => setPicker(true)}
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
      <Button size="sm" onClick={newDoc} disabled={!!busy} className="gap-1.5">
        {busy === `space:${space}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
        New doc
      </Button>
    </div>
  )

  const body = loading ? (
    <DocTreeSkeleton rows={4} />
  ) : empty ? (
    <WorkState>
      <Empty space={space} name={name} create={create} busy={busy} />
    </WorkState>
  ) : (
    <DocTree space={space} label={name ? `${name}'s docs` : "Docs"} dense={false} cap={PAGE_CAP} />
  )

  const picking = picker && (
    <React.Suspense fallback={null}>
      <TemplatePicker mode={{ kind: "create", space }} onClose={() => setPicker(false)} />
    </React.Suspense>
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
