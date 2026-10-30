"use client"

// EntityLinkPicker: a compact, Notion-style search popover to find and link a
// doc or board to a task/project. Backed by the existing access-scoped unified
// search (so users only see what they can open), debounced to keep it light.
// The search is a chunk of its own (EntityLinkSearch), asked for when the
// trigger is pointed at or focused: every task's panel draws this picker, and
// the task page's first load carried the search for it.

import * as React from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { lazyView } from "@/lib/lazy/lazyView"
import { inlineAdd } from "@/lib/ui/fieldRow"
import { Plus, Loader2 } from "@/lib/icons"
import type { LinkRefType } from "@/services/entityLinkService"

const SearchPart = lazyView(() => import("@/components/entityLink/EntityLinkSearch"))
const warmSearch = () => void SearchPart.prefetch()

interface EntityLinkPickerProps {
  onPick: (refType: LinkRefType, refUUID: string, title: string) => void
  isLinked: (refType: LinkRefType, refUUID: string) => boolean
  disabled?: boolean
  /** The trigger's classes: a section's quiet add button unless given (a toolbar's button, say). */
  triggerClassName?: string
}

export function EntityLinkPicker({ onPick, isLinked, disabled, triggerClassName }: EntityLinkPickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} className={triggerClassName ?? inlineAdd} onPointerEnter={warmSearch} onFocus={warmSearch}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Link a doc or board
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[20rem] p-0">
        <SearchPart.View
          fallback={
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening…
            </div>
          }
          render={(m) => (
            <m.EntityLinkSearch
              isLinked={isLinked}
              onPick={(refType, refUUID, title) => {
                onPick(refType, refUUID, title)
                setOpen(false)
              }}
            />
          )}
        />
      </PopoverContent>
    </Popover>
  )
}
