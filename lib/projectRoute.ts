import { app_project_path } from "@/types/paths"

/** The projects' own pages, by their titles: never a project's id (B9-b3). */
const PAGES = new Map([["dashboards", "Dashboards"]])

/** An /app/project address as both phone bars read it (DB-114 F1): {} the list, a page's title, or a project's id; undefined deeper or elsewhere. */
export function projectRouteOf(pathname: string): { page?: string; id?: string } | undefined {
  if (!`${pathname}/`.startsWith(`${app_project_path}/`)) return undefined
  const [seg, more] = pathname.slice(app_project_path.length + 1).split("/")
  if (more) return undefined
  if (!seg) return {}
  const page = PAGES.get(seg)
  return page ? { page } : { id: seg }
}
