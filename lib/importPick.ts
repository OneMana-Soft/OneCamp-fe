// What the admin picked in the import card, as the job's options. Pure.
//
// Each provider reads its own key: the web app used to send the pick for
// Asana, Jira and Todoist as "discover_id", which none of them read, so a
// picked project was shown and then the whole account came across.

import type { DiscoverItem, ImportProvider } from "@/services/importService"

/** The dropdown's value for "every project the account can see". */
export const ALL_OF_THEM = "__all__"

export type PickResult = { options: Record<string, unknown> } | { error: string }

/** What the dropdown asks for. */
export function pickLabel(provider: ImportProvider): string {
  switch (provider) {
    case "trello":
      return "Pick a Trello board"
    case "asana":
      return "Pick an Asana workspace"
    case "jira":
      return "Pick a Jira project"
    case "notion":
      return "Pick a Notion database"
    case "todoist":
      return "Pick a Todoist project"
    case "linear":
      return "Pick a Linear team (optional)"
    case "clickup":
      return "Pick a ClickUp workspace"
    case "monday":
      return "Pick a monday.com workspace (optional)"
  }
}

/** The "all of them" choice, for the providers that import projects one or all. */
export function allOfThemLabel(provider: ImportProvider, count: number): string | null {
  if (provider !== "jira" && provider !== "todoist") return null
  return count === 1 ? "The 1 project" : `All ${count} projects`
}

/** The job's options for a pick, or what is missing. */
export function optionsForPick(provider: ImportProvider, picked: string, items: DiscoverItem[], typedBoardId = ""): PickResult {
  const pick = picked.trim()
  switch (provider) {
    case "trello": {
      const board = pick || typedBoardId.trim()
      return board ? { options: { board_id: board } } : { error: "Pick a Trello board." }
    }
    case "notion":
      return { options: pick ? { databases: [pick] } : {} }
    case "asana":
      if (pick) return { options: { workspace_gid: pick } }
      // One workspace is no choice at all; several need one.
      if (items.length === 1) return { options: { workspace_gid: items[0].id } }
      if (items.length > 1) return { error: "Pick the Asana workspace to import." }
      return { options: {} }
    case "jira":
    case "todoist": {
      const key = provider === "jira" ? "project_key" : "project_id"
      if (pick === ALL_OF_THEM) return { options: {} }
      if (pick) return { options: { [key]: pick } }
      if (items.length > 0) return { error: `Pick a ${provider === "jira" ? "Jira" : "Todoist"} project, or all of them.` }
      return { options: {} }
    }
    case "linear":
      return { options: pick ? { team_id: pick } : {} }
    case "clickup":
    case "monday":
      return { options: pick ? { workspace_id: pick } : {} }
  }
}
