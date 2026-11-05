// Dashboards' reads and writes (B9-b3): the lists (yours and the workspace's,
// or one project's), one dashboard with its widgets, and its widgets worked
// out as the reader. Each write answers what it made or changed; the page
// reads again what the write moved. The server's refusals are shown by the
// app's own client (lib/axiosInstance), so a write that fails only throws.

import { useCallback } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { browserTZ } from "@/lib/utils/timeZone"
import { DashboardRoutes } from "@/services/endpoints/projects.dashboards"
import type { Dashboard, Place, Widget, WidgetData } from "@/lib/dashboards"

const base = DashboardRoutes.Dashboards
export const dashboardsKey = (project?: string) => (project ? `${DashboardRoutes.Project}/${project}/dashboards` : base)
export const dashboardKey = (id: string) => `${base}/${id}`
export const dashboardDataKey = (id: string) => `${base}/${id}/data?tz=${encodeURIComponent(browserTZ())}`

export interface DashboardLists {
  mine: Dashboard[]
  workspace: Dashboard[]
  project: Dashboard[]
  /** Whether the reader may make one here: the workspace's (its admins), or the project's (its admins). */
  canMake: boolean
}

type ListAnswer = { data: { mine?: Dashboard[] | null; workspace?: Dashboard[] | null; can_keep_workspace?: boolean; dashboards?: Dashboard[] | null; can_keep?: boolean } }

/** The dashboards the reader may open: theirs and the workspace's, or, given a project, that project's. */
export function useDashboardLists(project?: string) {
  const { data, isLoading, isError, mutate } = useFetch<ListAnswer>(dashboardsKey(project))
  const d = data?.data
  const lists: DashboardLists | undefined = d && {
    mine: d.mine ?? [],
    workspace: d.workspace ?? [],
    project: d.dashboards ?? [],
    canMake: project ? !!d.can_keep : !!d.can_keep_workspace,
  }
  const create = useCallback(
    async (input: { name: string; scope: "mine" | "workspace" | "project"; shared: boolean }) => {
      const url = input.scope === "project" && project ? dashboardsKey(project) : base
      const res = await axiosInstance.post<{ data: Dashboard }>(url, input)
      await mutate()
      return res.data.data
    },
    [project, mutate],
  )
  return { lists, isLoading, isError: !!isError, refresh: mutate, create }
}

type OneAnswer = { data: { dashboard: Dashboard; widgets: Widget[] | null; can_keep: boolean } }

/** One dashboard, its widgets (with what each asks) and whether the reader keeps it; then each widget worked out. */
export function useDashboard(id: string) {
  const one = useFetch<OneAnswer>(id ? dashboardKey(id) : "")
  const data = useFetch<{ data: { widgets: WidgetData[] | null } }>(id ? dashboardDataKey(id) : "", undefined, { keepPreviousData: true })
  const { mutate: readOne } = one
  const { mutate: readData } = data
  const reread = useCallback(async () => {
    await Promise.all([readOne(), readData()])
  }, [readOne, readData])
  const post = useCallback(async <T,>(path: string, body: unknown = {}) => {
    const res = await axiosInstance.post<{ data: T }>(`${dashboardKey(id)}${path}`, body)
    return res.data.data
  }, [id])
  const change = useCallback(async (input: { name: string; shared: boolean }) => {
    const d = await post<Dashboard>("", input)
    await readOne()
    return d
  }, [post, readOne])
  const remove = useCallback(() => post<{ id: string }>("/delete"), [post])
  const restore = useCallback(() => post<Dashboard>("/restore"), [post])
  const addWidget = useCallback(async (w: Omit<Widget, "id">) => {
    const made = await post<Widget>("/widgets", w)
    await reread()
    return made
  }, [post, reread])
  const changeWidget = useCallback(async (w: Widget) => {
    const changed = await post<Widget>(`/widgets/${w.id}`, w)
    await reread()
    return changed
  }, [post, reread])
  const removeWidget = useCallback(async (widget: string) => {
    await post(`/widgets/${widget}/delete`)
    await reread()
  }, [post, reread])
  const restoreWidget = useCallback(async (widget: string) => {
    await post(`/widgets/${widget}/restore`)
    await reread()
  }, [post, reread])
  const arrange = useCallback(async (places: Place[]) => {
    await post("/arrange", { places })
    await readOne()
  }, [post, readOne])
  return {
    dashboard: one.data?.data.dashboard,
    widgets: one.data?.data.widgets ?? [],
    canKeep: !!one.data?.data.can_keep,
    isLoading: one.isLoading,
    isError: !!one.isError,
    results: data.data?.data.widgets ?? undefined,
    resultsLoading: data.isLoading,
    resultsError: !!data.isError,
    refresh: reread,
    change,
    remove,
    restore,
    addWidget,
    changeWidget,
    removeWidget,
    restoreWidget,
    arrange,
  }
}
