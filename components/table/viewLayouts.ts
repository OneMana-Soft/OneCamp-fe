import { BarChart3, CalendarDays, CalendarRange, ChartGantt, Kanban, LayoutDashboard, LayoutGrid, List } from "@/lib/icons"
import type { ViewType } from "@/services/tableService"

/** A table's layouts, each with its name and glyph: the page's tabs and the views menu draw them alike. */
export const VIEW_LAYOUTS: { type: ViewType; label: string; icon: typeof LayoutGrid }[] = [
  { type: "grid", label: "Grid", icon: LayoutGrid },
  { type: "board", label: "Board", icon: Kanban },
  { type: "calendar", label: "Calendar", icon: CalendarDays },
  { type: "chart", label: "Chart", icon: BarChart3 },
  { type: "gallery", label: "Gallery", icon: LayoutDashboard },
  { type: "list", label: "List", icon: List },
  { type: "timeline", label: "Timeline", icon: CalendarRange },
  { type: "gantt", label: "Gantt", icon: ChartGantt },
]
