"use client"

// The sidebar's Docs section, once it is open (docs programme B5): the
// workspace's pages, the pages others shared with the person, and their own
// private pages, each a tree of its own. A group with nothing in it isn't
// shown (Shared appears the first time something is shared), and someone with
// no docs at all is offered the first. Loaded as a chunk of its own: the
// sidebar's first paint carries none of it (I20).

import * as React from "react"

import { usePathname } from "next/navigation"

import { useTreeLevel } from "@/components/tree/useTree"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { DocTree, TREE_CAP, adapterFor, docIdOfPath } from "@/components/docTree/DocTree"
import { useFetch } from "@/hooks/useFetch"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import type { DocInfoResponse } from "@/types/doc"
import { ChevronDown, Loader2, Plus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import type { DocSpace } from "@/types/docGraph"

interface Group {
  space: DocSpace
  label: string
  /** The tree's name, as a screen reader says it. */
  name: string
  /** Its "+": a page at the top of this group. */
  add?: string
}

const GROUPS: Group[] = [
  { space: "workspace", label: "Workspace", name: "Workspace pages", add: "New page in the workspace" },
  { space: "shared", label: "Shared with me", name: "Pages shared with me" },
  { space: "private", label: "Private", name: "Private pages", add: "New private page" },
]

/**
 * In the sidebar, five pages a level before "Show N more" (design review
 * PG1-02, 14 Oct 2026): the three trees, uncapped, sat above Channels and
 * Direct messages and pushed them off the first screen. Each group folds by
 * its name, as the person leaves it on this device; the one holding the doc
 * that's open always opens, on load and as the person moves between docs, so
 * the sidebar shows where they are. The Pages sheet on a phone has the room,
 * and shows them as they are.
 */
export const SIDEBAR_TREE_CAP = 5

/** Whether a group's top level holds anything, as far as it's known. */
function useGroupState(space: DocSpace, cap: number) {
  const { level, loading, failed } = useTreeLevel(adapterFor(space), null, cap)
  const empty = !!level && level.nodes.length === 0 && level.hidden === 0
  return { loading, failed, empty }
}

/** A sidebar group open or folded, as this person left it on this device (open until folded). */
function useGroupOpen(space: DocSpace, folds: boolean): [boolean, () => void, () => void] {
  const key = `docsGroup.open.${space}`
  const [open, setOpen] = React.useState(() => {
    if (!folds) return true
    try {
      return localStorage.getItem(key) !== "0"
    } catch {
      return true
    }
  })
  const toggle = React.useCallback(() => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? "0" : "1")
      } catch {
        /* kept for this visit only */
      }
      return !o
    })
  }, [key])
  // Opens it for the doc that's open, without changing what it's remembered as.
  const reveal = React.useCallback(() => setOpen(true), [])
  return [open, toggle, reveal]
}

/** The sidebar group a doc sits in: the workspace's, yours, or shared with you. Null until its info is in. */
export function groupOfDoc(info: { doc_private?: boolean; doc_created_by?: { user_uuid?: string } } | undefined, selfId: string | undefined): DocSpace | null {
  if (!info) return null
  if (!info.doc_private) return "workspace"
  return info.doc_created_by?.user_uuid && info.doc_created_by.user_uuid === selfId ? "private" : "shared"
}

/** The doc that's open, and the group holding it (the sidebar only; the doc page asks for the same info). */
function useOpenDocGroup(on: boolean): { docId: string | null; group: DocSpace | null } {
  const docId = docIdOfPath(usePathname())
  const info = useFetch<DocInfoResponse>(on && docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : "", undefined, undefined, OWN_ERRORS)
  const selfId = useSidenav().data?.data?.user_uuid
  return { docId, group: docId ? groupOfDoc(info.data?.data, selfId) : null }
}

export default function DocsTreeGroups({ onOpened, sidebar = false }: { onOpened?: () => void; sidebar?: boolean }) {
  const cap = sidebar ? SIDEBAR_TREE_CAP : TREE_CAP
  const states = [useGroupState("workspace", cap), useGroupState("shared", cap), useGroupState("private", cap)]
  const opens = [useGroupOpen("workspace", sidebar), useGroupOpen("shared", sidebar), useGroupOpen("private", sidebar)]
  const openDoc = useOpenDocGroup(sidebar)
  const reveal = openDoc.group ? opens[GROUPS.findIndex((g) => g.space === openDoc.group)]?.[2] : undefined
  // On load and on each move to another doc, even within a group folded since.
  React.useEffect(() => {
    reveal?.()
  }, [reveal, openDoc.docId])
  const { create, busy } = useCreateDoc()
  const known = states.every((s) => !s.loading)

  if (known && states.every((s) => s.empty)) {
    return (
      <button type="button" onClick={() => void create({ busyKey: "tree:first" })} disabled={!!busy} {...ix("nav")} className="shell-row nav-idle w-full text-left !text-ink-3">
        <span className="shell-invite-tile" aria-hidden="true">
          {busy === "tree:first" ? <Loader2 className="animate-spin" /> : <Plus />}
        </span>
        <span className="truncate">Write the first doc</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1" data-docs-tree-groups="">
      {GROUPS.map((g, i) => {
        const s = states[i]
        const [open, toggle] = opens[i]
        // Empty groups stay out of the way; a loading one keeps its place
        // (a skeleton row at the real height) only for the workspace's.
        if (s.empty || (s.loading && g.space !== "workspace")) return null
        return (
          <div key={g.space} data-docs-group={g.space} data-folded={open ? undefined : ""}>
            <div className="group/label flex h-6 items-center gap-1 pl-2 pr-1">
              {sidebar ? (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-label={`${open ? "Fold" : "Open"} ${g.label}`}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded-sm text-left text-micro font-medium text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <ChevronDown className={cn("size-3 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
                  <span className="truncate">{g.label}</span>
                </button>
              ) : (
                <span className="flex-1 truncate text-micro font-medium text-ink-3">{g.label}</span>
              )}
              {g.add && (
                <button
                  type="button"
                  aria-label={g.add}
                  title={g.add}
                  disabled={!!busy}
                  onClick={() => void create({ space: g.space, busyKey: `tree:top:${g.space}` })}
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-sm text-ink-3 opacity-0 outline-none transition-opacity hover:bg-[var(--press)] hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand group-hover/label:opacity-100 disabled:opacity-60 [@media(hover:none)]:opacity-100",
                    busy === `tree:top:${g.space}` && "opacity-100",
                  )}
                >
                  {busy === `tree:top:${g.space}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                </button>
              )}
            </div>
            {open ? <DocTree space={g.space} label={g.name} onOpened={onOpened} cap={cap} /> : null}
          </div>
        )
      })}
    </div>
  )
}
