/**
 * The boards list's Project picker's rows (miro-46 3), apart from the list's
 * filters (lib/board/boardListFilter) because only the picker reads them: the
 * picker is a chunk of its own (components/board/boardPlacePicker), so they
 * load when it is first opened, never with the list. Imports nothing. Pure.
 */
export interface PlaceGroup {
  /** The team; `pickable` when the viewer is in it (the server's team filter asks that). Null: projects with no team of theirs. */
  team: { uuid: string; name: string; pickable: boolean } | null
  projects: { uuid: string; name: string }[]
}

type ProjectRow = { project_uuid: string; project_name: string; project_deleted_at?: string; project_team?: { team_uuid?: string; team_name?: string } | null }
type TeamRow = { team_uuid: string; team_name: string }

/**
 * The picker's list: the viewer's projects under their teams, A to Z (an
 * archived one too: its linked boards still list, CR-231),
 * with each team the viewer is in even when none of its projects is theirs
 * (the team's filter still finds its boards), and projects without a team
 * last. A team the viewer isn't in is a heading only.
 */
export function groupByTeam(projects: ProjectRow[], myTeams: TeamRow[]): PlaceGroup[] {
  const az = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" })
  const mine = new Set(myTeams.map((t) => t?.team_uuid))
  const groups = new Map<string, PlaceGroup>()
  const loose: PlaceGroup = { team: null, projects: [] }
  for (const t of myTeams) if (t?.team_uuid) groups.set(t.team_uuid, { team: { uuid: t.team_uuid, name: t.team_name, pickable: true }, projects: [] })
  for (const p of projects) {
    if (!p?.project_uuid) continue
    const t = p.project_team
    let g = loose
    if (t?.team_uuid) {
      g = groups.get(t.team_uuid) ?? { team: { uuid: t.team_uuid, name: t.team_name || "A team", pickable: mine.has(t.team_uuid) }, projects: [] }
      groups.set(t.team_uuid, g)
    }
    g.projects.push({ uuid: p.project_uuid, name: p.project_name })
  }
  const out = [...groups.values()].sort((a, b) => az(a.team!.name, b.team!.name))
  if (loose.projects.length) out.push(loose)
  for (const g of out) g.projects.sort((a, b) => az(a.name, b.name))
  return out
}
