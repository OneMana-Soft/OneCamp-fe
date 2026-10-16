"use client"

// "New doc" on the docs home (docs programme B5): one press makes a blank doc
// (content.md D27: no dialog), and its chevron offers the other two ways to
// start: From a template… (the gallery's doc templates, written by the server
// as the doc is made) and Import files… (A7's import, at the top of your
// docs). Both open as chunks of their own, on first use.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { ChevronDown, LayoutTemplate, Loader2, Plus, Upload } from "@/lib/icons"
import { returnFocusOnlyForKeys } from "@/lib/ui/inputModality"
import type { DocSpace } from "@/types/docGraph"

const TemplatePicker = React.lazy(() => import("@/components/docTemplates/TemplatePicker"))
const ImportDocDialog = React.lazy(() => import("@/components/doc/ImportDocDialog"))

/**
 * `space`: where a blank doc goes, the open tab's (QA DSA-34: New doc on the
 * Workspace tab made a private doc); left out, it's private.
 */
export function NewDocButton({ space }: { space?: DocSpace } = {}) {
  const { create, busy } = useCreateDoc()
  const [open, setOpen] = React.useState<"template" | "import" | null>(null)

  return (
    <div className="inline-flex shrink-0 items-stretch" data-new-doc-button="">
      <Button size="sm" onClick={() => void create({ space })} disabled={!!busy} className="gap-1.5 rounded-r-none" aria-keyshortcuts="N">
        {busy === "blank" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
        New doc
        {/* The primary's own kbd look (design v3 §3.10: an 18% white fill). */}
        <kbd className="kbd ml-0.5" aria-hidden="true">
          N
        </kbd>
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" aria-label="More ways to start a doc" disabled={!!busy} className="rounded-l-none border-l border-[color-mix(in_oklab,var(--on-brand,var(--brand-foreground))_24%,transparent)] px-1.5">
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-56" onCloseAutoFocus={returnFocusOnlyForKeys}>
          <DropdownMenuItem onSelect={() => void create({ space })} className="gap-2">
            <Plus className="size-4 text-ink-3" aria-hidden="true" />
            Blank doc
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("template")} className="gap-2">
            <LayoutTemplate className="size-4 text-ink-3" aria-hidden="true" />
            From a template…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("import")} className="gap-2">
            <Upload className="size-4 text-ink-3" aria-hidden="true" />
            Import files…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <React.Suspense fallback={null}>
        {open === "template" && <TemplatePicker mode={{ kind: "create" }} onClose={() => setOpen(null)} />}
        {open === "import" && <ImportDocDialog docId="" onClose={() => setOpen(null)} />}
      </React.Suspense>
    </div>
  )
}
