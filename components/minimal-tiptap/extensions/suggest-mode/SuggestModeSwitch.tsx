"use client"

/**
 * Editing or Suggesting, in the doc's header (docs C5; a phone, which has no
 * header, has it on its sheet: contributions.ts), for someone who may
 * edit: in Suggesting, what they type becomes a suggestion for the doc's
 * people to accept or decline, as in a shared doc anywhere. A reader who may
 * comment suggests from the selection bar instead ("Suggest edit"); a hard
 * lock takes no suggestions, so neither shows then.
 */

import * as React from "react"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronDown, Pencil, SquarePen } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { docLevelOf, offersModes } from "@/lib/docs/abilities"
import { useDoc } from "@/components/docEditor/chrome/useDoc"
import { usePageFacts } from "@/components/docEditor/chrome/pageFacts"
import { setSuggesting, subscribeSuggest, suggestStateOf } from "./suggestMode"

export default function SuggestModeSwitch({ docId, editor }: SlotProps) {
  const doc = useDoc(docId)
  const facts = usePageFacts(docId)
  const state = React.useSyncExternalStore(subscribeSuggest, () => suggestStateOf(editor), () => suggestStateOf(null))
  const offered = offersModes(docLevelOf(doc), facts.lock || doc?.doc_lock_level)

  // A hard lock, or access lost while suggesting: back to the doc as it is.
  React.useEffect(() => {
    if (!offered && editor && suggestStateOf(editor).suggesting) setSuggesting(editor, false)
  }, [offered, editor])

  if (!editor || !offered) return null
  const suggesting = state.suggesting
  const Icon = suggesting ? SquarePen : Pencil
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-suggest-mode={suggesting ? "suggesting" : "editing"}
          aria-label={suggesting ? "Suggesting: your changes are suggestions" : "Editing: your changes go straight in"}
          className={cn("gap-1 px-2 text-ui", suggesting ? "text-success-ink" : "text-ink-2")}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden md:inline">{suggesting ? "Suggesting" : "Editing"}</span>
          <ChevronDown className="size-3 text-ink-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup value={suggesting ? "suggesting" : "editing"} onValueChange={(v) => setSuggesting(editor, v === "suggesting")}>
          <DropdownMenuRadioItem value="editing" className="flex-col items-start gap-0.5">
            <span className="font-medium">Editing</span>
            <span className="text-meta text-ink-3">Change the doc directly</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="suggesting" className="flex-col items-start gap-0.5">
            <span className="font-medium">Suggesting</span>
            <span className="text-meta text-ink-3">Your changes become suggestions to accept or decline</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
