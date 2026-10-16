// The docs home's tabs (docs programme B5, structure.md P0.6): which lists
// it has, what each can be sorted and filtered by, and which opens first.
//
// There were two tabs, Private and Public, and nothing listed a doc someone
// shared with you. Now: Recent (what you opened), Mine, Shared with me,
// Workspace, Starred, and Archived, each the server's list with its exact
// count (A3's /doc/list). A tab named in the address wins, an old address's
// Private and Public included; otherwise Recent, or Workspace for someone who
// hasn't opened a doc yet.

import type { DocListScope } from "@/types/docGraph"

export const DOC_TABS = ["recent", "mine", "shared", "workspace", "starred", "archived"] as const satisfies readonly DocListScope[]
export type DocTab = (typeof DOC_TABS)[number]

export const DOC_TAB_LABEL: Record<DocTab, string> = {
  recent: "Recent",
  mine: "Mine",
  shared: "Shared with me",
  workspace: "Workspace",
  starred: "Starred",
  archived: "Archived",
}

export function isDocTab(v: unknown): v is DocTab {
  return typeof v === "string" && (DOC_TABS as readonly string[]).includes(v)
}

/** The tab an address names, an old address's included (?tab=private, ?tab=public), or null. Pure. */
export function tabFromAddress(urlTab: string | null): DocTab | null {
  if (isDocTab(urlTab)) return urlTab
  if (urlTab === "private") return "mine"
  if (urlTab === "public") return "workspace"
  return null
}

/** The tab to open: the address's, else Recent, or Workspace when Recent is empty (recentCount undefined while it loads). Pure. */
export function defaultDocTab(urlTab: string | null, recentCount: number | undefined): DocTab {
  return tabFromAddress(urlTab) ?? (recentCount === 0 ? "workspace" : "recent")
}

/**
 * Why a tab's list can't be sorted or filtered a way, for that control drawn
 * dimmed: every tab draws the same toolbar row (QA DSA-31: the owner filter
 * showed on Workspace alone, and Recent had no row). Pure.
 */
export function tabToolsOff(tab: DocTab): { sort?: string; owner?: string; space?: string } {
  switch (tab) {
    case "recent":
      return { sort: "Recent is in the order you opened them", owner: "Recent is what you opened", space: "Recent is what you opened" }
    case "starred":
      return { sort: "Starred is in the order you starred them", owner: "Starred is what you starred", space: "Starred is what you starred" }
    case "mine":
      return { owner: "Every doc in Mine is yours" }
    default:
      return {}
  }
}

/** What a tab's list can be sorted and filtered by: Recent is in the order you opened things, Starred in yours. */
export function tabTools(tab: DocTab): { sort: boolean; owner: boolean; space: boolean } {
  switch (tab) {
    case "recent":
    case "starred":
      return { sort: false, owner: false, space: false }
    case "mine":
      return { sort: true, owner: false, space: true }
    default:
      return { sort: true, owner: true, space: true }
  }
}
