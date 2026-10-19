"use client"

import * as React from "react"

import { ChevronLeft } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"

/**
 * A sheet panel's header (components/ui/sheetPanels): Back, neutral ink so
 * the panel's one orange is the pinned action, and the field's name in the
 * middle. Loaded with the first panel a sheet opens.
 */
export default function PanelHeader({ id, title, onBack }: { id: string; title: string; onBack: () => void }) {
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
      <button
        type="button"
        data-sheet-back=""
        onClick={onBack}
        {...ix("button")}
        className="-ml-2 inline-flex h-11 items-center gap-0.5 justify-self-start rounded-md pl-1 pr-2 text-body font-[510] text-ink-2"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Back
      </button>
      <h3 id={id} className="text-title-3 text-ink">
        {title}
      </h3>
    </div>
  )
}
