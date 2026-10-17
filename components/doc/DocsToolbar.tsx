"use client"

// The docs home's view controls (docs programme B5): how a list is sorted,
// whose docs and which space's it keeps, and cards or rows. Each shows only
// where its list has an order of its own to change (lib/utils/docTab). A
// filter that is on says so in its button ("Owner: Maya"), so a short list
// never looks like a short workspace.

import * as React from "react"
import { useSelector } from "react-redux"

import { ArrowUpDown, Check, ChevronDown, LayoutGrid, List, Search, Users, X } from "@/lib/icons"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { usePost } from "@/hooks/usePost"
import { useDebounce } from "@/hooks/useDebounce"
import { displayNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import { PostEndpointUrl } from "@/services/endPoints"
import type { RootState } from "@/store/store"
import type { DocListSort, DocSpace } from "@/types/docGraph"
import type { ChannelAndUserListInterfaceResp } from "@/types/user"
import type { DocsView } from "@/components/doc/docListResult"
import { ix } from "@/lib/ui/interactive"

export const SORT_LABEL: Record<DocListSort, string> = { edited: "Last edited", created: "Date created", title: "Title" }

/** Who a filter keeps: their uuid and name. */
export interface OwnerChoice {
  uuid: string
  name: string
}

const chip =
  "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-ui-sm text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-press data-[state=open]:text-ink"
const on = "bg-hover text-ink"
const option = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm text-ink"

function Choice({ chosen, onClick, children }: { chosen: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={chosen} onClick={onClick} {...ix("item")} className={option}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {chosen && <Check className="size-3.5 shrink-0 text-ink-2" aria-hidden="true" />}
    </button>
  )
}

/**
 * A popover menu of choices, its trigger the toolbar's chip. `off` is why it
 * doesn't apply to this list: the chip stays in its place, dimmed, says why,
 * and opens nothing.
 */
function Menu({ label, active, icon: Icon, children, width = "w-56", off }: { label: string; active: boolean; icon: React.ElementType; children: (close: () => void) => React.ReactNode; width?: string; off?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open && !off} onOpenChange={(o) => setOpen(o && !off)}>
      <PopoverTrigger asChild>
        <button type="button" aria-disabled={off ? true : undefined} title={off} data-tool-off={off ? "" : undefined} className={cn(chip, active && !off && on, off && "cursor-default opacity-50 hover:bg-transparent hover:text-ink-2")}>
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="max-w-40 truncate">{label}</span>
          {off ? <span className="sr-only">, {off}</span> : null}
          <ChevronDown className="size-3 shrink-0 text-ink-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className={cn("p-1", width)} role="menu" aria-label={label}>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

/** People found by name, for the owner filter. */
function usePeopleSearch(text: string) {
  const q = useDebounce(text.trim(), 200)
  const { makeRequest } = usePost()
  const [found, setFound] = React.useState<OwnerChoice[]>([])
  React.useEffect(() => {
    if (q.length < 2) {
      // Already empty stays the same list, so nothing renders again for it.
      setFound((f) => (f.length ? [] : f))
      return
    }
    let alive = true
    makeRequest<{ search_text: string }, ChannelAndUserListInterfaceResp[]>({ apiEndpoint: PostEndpointUrl.SearchUserAndChannel, payload: { search_text: q } })
      .then((res) => {
        if (alive) setFound((res ?? []).filter((r) => r.user_uuid).slice(0, 6).map((r) => ({ uuid: r.user_uuid, name: displayNameOf(r) })))
      })
      .catch(() => alive && setFound([]))
    return () => {
      alive = false
    }
  }, [q, makeRequest])
  return found
}

function OwnerMenu({ owner, onOwner, selfId, off }: { owner: OwnerChoice | null; onOwner: (o: OwnerChoice | null) => void; selfId?: string; off?: string }) {
  const [text, setText] = React.useState("")
  const found = usePeopleSearch(text)
  const label = off || !owner ? "Owner: anyone" : owner.uuid === selfId ? "Owner: me" : `Owner: ${owner.name}`
  return (
    <Menu label={label} active={!!owner} icon={Users} width="w-64" off={off}>
      {(close) => (
        <>
          <Choice chosen={!owner} onClick={() => {
              onOwner(null)
              close()
            }}>
            Anyone
          </Choice>
          {selfId && (
            <Choice chosen={owner?.uuid === selfId} onClick={() => {
              onOwner({ uuid: selfId, name: "me" })
              close()
            }}>
              Me
            </Choice>
          )}
          <label className="mt-1 flex h-8 items-center gap-2 rounded-md bg-sunken px-2 text-ink-3 focus-within:focus-halo">
            <Search className="size-3.5 shrink-0" aria-hidden="true" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Find a person"
              aria-label="Find a person"
              className="min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          {found.map((p) => (
            <Choice key={p.uuid} chosen={owner?.uuid === p.uuid} onClick={() => {
              onOwner(p)
              setText("")
              close()
            }}>
              {p.name}
            </Choice>
          ))}
        </>
      )}
    </Menu>
  )
}

function SpaceMenu({ space, onSpace, off }: { space: DocSpace | null; onSpace: (s: DocSpace | null) => void; off?: string }) {
  const projects = useSelector((s: RootState) => s.users.userSidebar.userProjects) ?? []
  const teams = useSelector((s: RootState) => s.users.userSidebar.userTeams) ?? []
  const name = (s: DocSpace | null) =>
    !s
      ? "All spaces"
      : s.startsWith("project:")
        ? projects.find((p) => `project:${p.project_uuid}` === s)?.project_name ?? "A project"
        : teams.find((t) => `team:${t.team_uuid}` === s)?.team_name ?? "A team"
  if (projects.length === 0 && teams.length === 0) return null
  return (
    <Menu label={space && !off ? `In ${name(space)}` : "All spaces"} active={!!space} icon={LayoutGrid} off={off}>
      {(close) => (
        <div className="max-h-80 overflow-y-auto">
          <Choice chosen={!space} onClick={() => {
              onSpace(null)
              close()
            }}>
            All spaces
          </Choice>
          {projects.length > 0 && <p className="px-2 pb-1 pt-2 text-micro font-medium text-ink-3">Projects</p>}
          {projects.filter(Boolean).map((p) => (
            <Choice key={p.project_uuid} chosen={space === `project:${p.project_uuid}`} onClick={() => {
              onSpace(`project:${p.project_uuid}`)
              close()
            }}>
              {p.project_name}
            </Choice>
          ))}
          {teams.length > 0 && <p className="px-2 pb-1 pt-2 text-micro font-medium text-ink-3">Teams</p>}
          {teams.filter(Boolean).map((t) => (
            <Choice key={t.team_uuid} chosen={space === `team:${t.team_uuid}`} onClick={() => {
              onSpace(`team:${t.team_uuid}`)
              close()
            }}>
              {t.team_name}
            </Choice>
          ))}
        </div>
      )}
    </Menu>
  )
}

export function DocsToolbar({
  tools,
  sort,
  onSort,
  owner,
  onOwner,
  space,
  onSpace,
  view,
  onView,
  selfId,
  className,
  off,
}: {
  tools: { sort: boolean; owner: boolean; space: boolean; view: boolean }
  sort: DocListSort
  onSort: (s: DocListSort) => void
  owner: OwnerChoice | null
  onOwner: (o: OwnerChoice | null) => void
  space: DocSpace | null
  onSpace: (s: DocSpace | null) => void
  view: DocsView
  onView: (v: DocsView) => void
  selfId?: string
  className?: string
  /**
   * A tab's own list: every control is drawn, the ones that don't apply
   * dimmed with why (QA DSA-31), so the row is the same on every tab. A
   * search draws only what applies to it.
   */
  off?: { sort?: string; owner?: string; space?: string }
}) {
  // A filter counts where its control shows: one set on another list never
  // offers "Clear filters" where it doesn't apply.
  const filtered = (tools.owner && !!owner) || (tools.space && !!space)
  // Cards or rows is the desktop's only: a phone always lists rows, so a
  // list with nothing else to change draws no empty band above it there.
  const viewOnly = !tools.sort && !tools.owner && !tools.space && !filtered
  if (viewOnly && !tools.view && !off) return null
  const show = (k: "sort" | "owner" | "space") => tools[k] || !!off?.[k]
  return (
    <div className={cn("flex min-h-8 flex-wrap items-center gap-1", viewOnly && "max-sm:hidden", className)} data-docs-toolbar="">
      {show("sort") && (
        <Menu label={SORT_LABEL[tools.sort ? sort : "edited"]} active={tools.sort && sort !== "edited"} icon={ArrowUpDown} width="w-44" off={tools.sort ? undefined : off?.sort}>
          {(close) =>
            (Object.keys(SORT_LABEL) as DocListSort[]).map((s) => (
              <Choice key={s} chosen={s === sort} onClick={() => {
              onSort(s)
              close()
            }}>
                {SORT_LABEL[s]}
              </Choice>
            ))
          }
        </Menu>
      )}
      {show("owner") && <OwnerMenu owner={owner} onOwner={onOwner} selfId={selfId} off={tools.owner ? undefined : off?.owner} />}
      {show("space") && <SpaceMenu space={space} onSpace={onSpace} off={tools.space ? undefined : off?.space} />}
      {filtered && (
        <button type="button" onClick={() => {
            onOwner(null)
            onSpace(null)
          }} className={cn(chip, "text-ink-3")}>
          <X className="size-3.5" aria-hidden="true" />
          Clear filters
        </button>
      )}
      {tools.view && (
        <SegmentedControl<DocsView>
          aria-label="Show docs as"
          value={view}
          onValueChange={onView}
          className="ml-auto max-sm:hidden"
          options={[
            { value: "grid", label: <span className="sr-only">Cards</span>, icon: LayoutGrid, title: "Cards" },
            { value: "list", label: <span className="sr-only">List</span>, icon: List, title: "List" },
          ]}
        />
      )}
    </div>
  )
}
