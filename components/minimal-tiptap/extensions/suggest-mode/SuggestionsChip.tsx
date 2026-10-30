"use client"

/**
 * How many suggestions wait on a doc, by its title (docs C5): a chip that
 * opens the list of them beside the doc. Nothing when none wait.
 */

import * as React from "react"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { useDocBus } from "@/components/docEditor/registry/commandBus"
import { ix } from "@/lib/ui/interactive"
import { useDocProposals } from "@/services/proposalService"
import { isOpen } from "./sync"

export default function SuggestionsChip({ docId }: SlotProps) {
  const { proposals } = useDocProposals(docId)
  const bus = useDocBus()
  const open = proposals.filter(isOpen).length
  if (open === 0) return null
  const word = open === 1 ? "suggestion" : "suggestions"
  const label = `${open} ${word}`
  return (
    <button
      type="button"
      data-suggestions-chip=""
      {...ix("chip")}
      onClick={() => bus.emit("openPanel", { kind: "suggestions" })}
      aria-label={`${label} waiting. Show them`}
      className="chip h-[22px] gap-1 px-2 text-xs text-success-ink"
    >
      {open}{" "}
      {/* Its word goes in a narrow header (app/globals.css), leaving the count beside the title. */}
      <span data-chip-word="">{word}</span>
    </button>
  )
}
