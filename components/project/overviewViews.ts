import type { WorkTab } from "@/components/task/WorkTabs"
import { BarChart3, ChartGantt, LayoutDashboard, List, Repeat, Target, Users } from "@/lib/icons"
import { app_project_path } from "@/types/paths"

export type OverviewView = "table" | "timeline" | "workload" | "cycles" | "goals" | "reports"
export const isView = (v: unknown): v is OverviewView => v === "table" || v === "timeline" || v === "workload" || v === "cycles" || v === "goals" || v === "reports"

/** Dashboards are a page of their own (B9-b3), beside the overview's views. */
export const app_dashboards_path = `${app_project_path}/dashboards`

/**
 * The overview's views as the project page's tabs (design v3, work.md W38):
 * Table is now "Projects", and the switcher stopped being a boxed toggle, so
 * the overview and a project share one tab language. Dashboards, last, opens
 * its own page, which shows these tabs too.
 */
export const VIEWS: readonly WorkTab<OverviewView | "dashboards">[] = [
  { value: "table", label: "Projects", icon: List },
  { value: "timeline", label: "Timeline", icon: ChartGantt },
  { value: "workload", label: "Workload", icon: Users },
  { value: "cycles", label: "Cycles", icon: Repeat },
  { value: "goals", label: "Goals", icon: Target },
  { value: "reports", label: "Reports", icon: BarChart3 },
  { value: "dashboards", label: "Dashboards", icon: LayoutDashboard },
]
