"use client"

// The sidebar's Docs section (docs programme B5): its heading, which opens the
// docs home, the toggle beside it and "+" for a new doc, as every section has
// (S7). Its page tree is a chunk of its own (DocsTreeGroups), loaded once the
// section is open: the sidebar's first load carries only this heading. While
// it arrives, three rows at the tree's height stand in (never a spinner).

import * as React from "react"

import { ChevronDown, Plus } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { lastInputWasPointer } from "@/lib/ui/inputModality"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { app_doc_path } from "@/types/paths"

// A chunk that failed to load stays failed in React.lazy, so trying again
// makes a new one.
const loadGroups = () => React.lazy(() => import("@/components/docTree/DocsTreeGroups"))
let DocsTreeGroups = loadGroups()

/** Rows at the tree's height while its code or its first level arrives. */
export function DocTreeSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading your docs" data-doc-tree-skeleton="" className="flex flex-col gap-px">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-7 items-center gap-2 px-2">
          <span className="size-4 shrink-0 rounded-[4px] bg-press" />
          <span className="h-2.5 rounded-sm bg-press" style={{ width: `${[58, 44, 66][i % 3]}%` }} />
        </div>
      ))}
    </div>
  )
}

/** Keeps a chunk that failed to load inside the section, with a way to try again. */
class TreeLoadBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>
    return (
      <div className="flex h-7 items-center gap-1 px-2 text-2xs text-ink-3">
        <span className="truncate">Couldn&apos;t load your docs.</span>
        <SaysLoadFailure />
        <button
          type="button"
          onClick={() => {
            DocsTreeGroups = loadGroups()
            this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))
          }}
          className="font-medium text-ink-2 underline-offset-2 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }
}

export function DocsSection({ open, setOpen, active, onAdd }: { open: boolean; setOpen: (open: boolean) => void; active: boolean; onAdd: () => void }) {
  return (
    <section aria-label="Docs" data-section="Docs">
      <div className="shell-sect">
        <IntentLink href={app_doc_path} aria-current={active ? "page" : undefined} className={cn("shell-sect-btn", active && "text-ink")}>
          <span className="truncate">Docs</span>
        </IntentLink>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Hide docs" : "Show docs"}
          {...ix("icon")} className="shell-icon-btn shell-sect-plus"
          data-size="24"
        >
          <ChevronDown className={cn("h-3.5 w-3.5", !open && "-rotate-90")} aria-hidden="true" />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onAdd} aria-label="New doc" {...ix("icon")} className="shell-icon-btn shell-sect-plus" data-size="24">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">New doc</TooltipContent>
        </Tooltip>
      </div>
      {open && (
        <div className="shell-sect-rows" data-instant={lastInputWasPointer() ? undefined : "true"}>
          <TreeLoadBoundary>
            <React.Suspense fallback={<DocTreeSkeleton />}>
              <DocsTreeGroups sidebar />
            </React.Suspense>
          </TreeLoadBoundary>
        </div>
      )}
    </section>
  )
}
