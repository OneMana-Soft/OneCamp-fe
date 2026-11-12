import { app_board_path } from "@/types/paths"

/**
 * The boards list's filters (miro-46 1 and 3): whose boards (owner=mine, the
 * viewer's own; owner=shared, every other one they may read) and where they
 * are linked (project=<uuid>, or team=<uuid> for every project of the team).
 * The page's address is the one place they live, so a filtered list is a
 * link, Back steps through the filters, and the list's request reads the
 * same three. A project and a team at once is no list the server makes, so
 * the project, the narrower, stands; anything else unknown is dropped. Pure.
 */
export type BoardOwner = "mine" | "shared"

export interface BoardFilter {
  owner: BoardOwner | null
  project: string | null
  team: string | null
}

export const NO_FILTER: BoardFilter = { owner: null, project: null, team: null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idOf = (v: string | null) => (v && UUID.test(v.trim()) ? v.trim() : null)

/** The filter an address says. */
export function readBoardFilter(params: Pick<URLSearchParams, "get">): BoardFilter {
  const owner = params.get("owner")
  const project = idOf(params.get("project"))
  return { owner: owner === "mine" || owner === "shared" ? owner : null, project, team: project ? null : idOf(params.get("team")) }
}

/** The filter as parameters, for an address or the list's request: "owner=mine&project=<uuid>"; "" for none. */
export function boardFilterParams(f: BoardFilter): string {
  const p = new URLSearchParams()
  if (f.owner) p.set("owner", f.owner)
  if (f.project) p.set("project", f.project)
  else if (f.team) p.set("team", f.team)
  return p.toString()
}

/** The boards list at `f`, keeping whatever else the address (`current`) holds. */
export function boardsHref(f: BoardFilter, current = ""): string {
  const rest = new URLSearchParams(current)
  for (const k of ["owner", "project", "team"]) rest.delete(k)
  const q = [rest.toString(), boardFilterParams(f)].filter(Boolean).join("&")
  return q ? `${app_board_path}?${q}` : app_board_path
}

export const isFiltered = (f: BoardFilter) => !!(f.owner || f.project || f.team)

/** What an empty list says under `f`; `place` names its project or team. */
export function emptyCopy(f: BoardFilter, place = ""): { title: string; description: string } {
  if (f.project || f.team) {
    const where = f.project ? place || "this project" : `${place || "this team"}'s projects`
    return {
      title: f.owner === "mine" ? `None of your boards are linked to ${where} yet.` : f.owner === "shared" ? `Nothing shared with you is linked to ${where} yet.` : `No boards linked to ${where} yet.`,
      description: `To link one, open ${f.project ? "the project's" : "a project's"} Attachments tab and choose Link a doc or board.`,
    }
  }
  return f.owner === "shared"
    ? { title: "Nothing shared with you yet.", description: "Boards someone shares with you, or with the whole workspace, show here." }
    : { title: "No boards of yours yet.", description: "Boards you make show here." }
}

/** Why a filter was let go: its project or team isn't there, or isn't the viewer's. */
export const unavailableLine = (f: BoardFilter) => (f.team ? "That team isn't available." : "That project isn't available.")
