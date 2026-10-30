import type { ReactNode } from "react"
import { ChevronDown, Lock } from "@/lib/icons"
import { VIEW_LAYOUTS } from "@/components/table/viewLayouts"
import type { TableView, ViewType } from "@/services/tableService"

/** The views menu's trigger box, one width: the page's stand-in and the menu's own sit alike, so the tabs never move. */
export const VIEW_TRIGGER = "flex h-7 w-36 shrink-0 items-center gap-1.5 rounded-md px-2 text-ui-sm font-medium text-ink sm:w-44"

/** What the trigger shows: the view's layout, its name (… when long), then its lock and the menu's mark (its changed dot: none on the stand-in, so none in the route), the chevron last. */
export function ViewFace({ view, layout, children }: { view: TableView | null; layout: ViewType; children?: ReactNode }) {
  const Icon = (VIEW_LAYOUTS.find((l) => l.type === (view?.type ?? layout)) ?? VIEW_LAYOUTS[0]).icon
  return (
    <>
      <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span className="min-w-0 truncate text-left">{view?.name ?? "Views"}</span>
      {view?.locked ? <Lock className="size-3 shrink-0 text-ink-3" aria-hidden="true" /> : null}
      {children}
      <ChevronDown className="ml-auto size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
    </>
  )
}
