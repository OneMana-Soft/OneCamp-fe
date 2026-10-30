// What the admin picked in the import card, as the job's options. Pure.
//
// Each provider reads its own key: the web app used to send the pick for
// Asana, Jira and Todoist as "discover_id", which none of them read, so a
// picked project was shown and then the whole account came across.

import type { DiscoverItem, TokenProvider } from "@/services/importService"

/** The dropdown's value for "every project the account can see". */
export const ALL_OF_THEM = "__all__"

export type PickResult = { options: Record<string, unknown> } | { error: string }

/**
 * What the dropdown asks for, or for Google Sheets, which has no list to pick
 * from, the box its spreadsheets are pasted in. With a provider's pages, a
 * picked Notion database comes across as a project too; the rest come as tables.
 */
export function pickLabel(provider: TokenProvider, pages = false): string {
  if (provider === "notion" && pages) return "Database to bring as a project (optional)"
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
    case "basecamp":
      return "Pick a Basecamp account"
    case "miro":
      return "Pick a Miro board"
    case "airtable":
      return "Pick an Airtable base (optional)"
    case "gsheets":
      return "Spreadsheets to bring"
  }
}

/** The "all of them" choice, for the providers that import projects one or all. */
export function allOfThemLabel(provider: TokenProvider, count: number): string | null {
  if (provider === "miro") return count === 1 ? "The 1 board" : `All ${count} boards`
  if (provider !== "jira" && provider !== "todoist") return null
  return count === 1 ? "The 1 project" : `All ${count} projects`
}

/**
 * The job's options for a pick, or what is missing. `typed` is what the admin
 * typed where the tool has no list to pick from: Trello's board id, or Google
 * Sheets' spreadsheets. With pages, a provider that brings them (its "pages"
 * capability) brings them too.
 */
export function optionsForPick(provider: TokenProvider, picked: string, items: DiscoverItem[], typed = "", pages = false): PickResult {
  const out = pickOptions(provider, picked.trim(), items, typed)
  return pages && "options" in out ? { options: { ...out.options, pages: true } } : out
}

function pickOptions(provider: TokenProvider, pick: string, items: DiscoverItem[], typed: string): PickResult {
  switch (provider) {
    case "trello": {
      const board = pick || typed.trim()
      return board ? { options: { board_id: board } } : { error: "Pick a Trello board." }
    }
    case "notion":
      return { options: pick ? { databases: [pick] } : {} }
    case "asana":
      return oneOrPicked("workspace_gid", "Pick the Asana workspace to import.", pick, items)
    case "basecamp":
      return oneOrPicked("account_id", "Pick the Basecamp account to import.", pick, items)
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
    case "miro":
      // One board is no choice at all; several need one, or all of them.
      if (pick === ALL_OF_THEM) return { options: {} }
      if (pick) return { options: { board_id: pick } }
      if (items.length === 1) return { options: { board_id: items[0].id } }
      if (items.length > 1) return { error: "Pick a Miro board, or all of them." }
      return { options: {} }
    case "airtable":
      // One base, or (none picked) every base the token reaches.
      return { options: pick ? { bases: [pick] } : {} }
    case "gsheets": {
      // Each an address or an id, which hold no spaces; the server reads
      // either, and brings each spreadsheet once.
      const spreadsheets = typed.split(/\s+/).filter(Boolean)
      return spreadsheets.length ? { options: { spreadsheets } } : { error: "Paste the address of each spreadsheet to bring, one a line." }
    }
  }
}

// The pick, or the only one there is: one is no choice at all, several need one.
function oneOrPicked(key: string, ask: string, pick: string, items: DiscoverItem[]): PickResult {
  if (pick) return { options: { [key]: pick } }
  if (items.length === 1) return { options: { [key]: items[0].id } }
  if (items.length > 1) return { error: ask }
  return { options: {} }
}
