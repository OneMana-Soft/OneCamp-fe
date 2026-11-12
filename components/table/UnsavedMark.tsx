"use client"

import * as React from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useTableEdit } from "@/lib/tables/tableEdit"

const named = new Intl.ListFormat("en", { type: "conjunction" })

/**
 * The mark of an edit the server asked to have again (503: nothing of it
 * stored; useCellCommit's unsaved, V-583), a grid cell's and a phone list
 * row's alike: a still danger dot that is a Retry itself (V-640), a button
 * named for what it sends ("Retry saving Cost"), reached by Tab and pressed
 * by Enter, a click or a finger (44 px on a touch screen, table.css). Pressed,
 * it sends the kept edits again through useCellCommit's one retry (retryCell),
 * the toast's Retry too; a cell a range write kept (a paste) sends that whole
 * write, and its mark is named for it ("Retry saving the paste: 2 cells and 1
 * new row", RowEdits' named, V-617); nothing presses it but the person. A reader who may
 * only view the table (V-170) keeps no edit and gets no mark. Its words ("Not
 * saved · Retry saving Cost") are the shared tooltip's, so hover, keyboard
 * focus and a long press all show them (a long press's release sends nothing:
 * useLongPress swallows its click); its own provider, as a grid can sit under
 * a host without one. Pressed with the focus, it hands the focus to its
 * host's own control before it goes (DESIGN-BUILD-122's F3: unmounted with
 * the focus in it, it dropped a keyboard user to the page).
 */
export function UnsavedMark({ names, onRetry }: { names: string[]; onRetry: () => void }) {
  if (!useTableEdit()) return null
  const what = named.format(names)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-unsaved-mark=""
            aria-label={`Retry saving ${what}`}
            onClick={(e) => {
              handOn(e.currentTarget)
              onRetry()
            }}
          >
            <span aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{`Not saved · Retry saving ${what}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * The focus a pressed mark holds, handed to its host's own control: the
 * nearest one around it, a grid cell's box ([data-cell]) or a phone list
 * row's button. A press that came without the focus (a tap, a click in a
 * browser that focuses no button) moves none.
 */
function handOn(mark: HTMLElement) {
  if (document.activeElement !== mark) return
  for (let at = mark.parentElement; at; at = at.parentElement) {
    const to = at.querySelector<HTMLElement>("[data-cell]") ?? at.querySelector<HTMLElement>("button:not([data-unsaved-mark])")
    if (to) return void to.focus()
  }
}
