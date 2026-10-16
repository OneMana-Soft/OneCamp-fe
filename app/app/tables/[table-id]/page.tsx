"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  ChevronRight,
  Globe,
  Lock,
  LayoutGrid,
  Kanban,
  CalendarDays,
  BarChart3,
  LayoutTemplate,
  Share2,
  MoreHorizontal,
  Download,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Plus,
  List,
  SlidersHorizontal,
  X,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import { DataTableGrid } from "@/components/table/DataTableGrid"
import { BoardGroupBy, DataTableBoard } from "@/components/table/DataTableBoard"
import { CalendarMonthNav, DataTableCalendar, monthOf } from "@/components/table/DataTableCalendar"
import { DataTableChart } from "@/components/table/DataTableChart"
import { RecordPanel } from "@/components/table/RecordPanel"
import { TableRowList } from "@/components/table/TableRowList"
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog"
import {
  createRow,
  deleteTable,
  readEveryRow,
  updateTable,
  Visibility,
  ViewType,
  parseFieldConfig,
  parseViewConfig,
  type TableRow,
} from "@/services/tableService"
import { applyViewRules, fitRules, keepInSight, KEPT_NOTE, kindOfField, loadViewRules, NO_RULES, OPS_FOR, saveViewRules, searchRows, type ViewRules } from "@/lib/tables/viewRules"
import { ROWS_HELD_MAX, useTableRows } from "@/lib/tables/useTableRows"
import { usePageName } from "@/lib/utils/pageName"
import { isComposingKey } from "@/lib/keys/ime"
import { ToastAction } from "@/components/ui/toast"
import { formatLocale } from "@/lib/tables/numberFormat"
import { ViewRulesBar } from "@/components/table/ViewRulesBar"
import { TableGlyph } from "@/components/table/TableGlyph"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { Skeleton } from "@/components/ui/skeleton"
import { TableViewState, TABLE_VIEW_INSET, TOUCH_ROW } from "@/components/table/TableViewFrame"
import { hueFor } from "@/lib/campHue"
import { viewFromQuery, type ViewChoice } from "@/lib/tables/tableView"
import { SaveDot, type SaveState } from "@/components/docEditor/SaveDot"
import { DEFAULT_DISPLAY, ROW_HEIGHTS, listByDefault, loadDisplay, saveDisplay, type TableDisplay } from "@/lib/tables/display"
import { useCellCommit } from "@/lib/tables/useCellCommit"
import { FIELD_GLYPH } from "@/components/table/gridCells"
import { toCsv } from "@/lib/tables/csv"

const VIEW_TABS: { type: ViewType | "chart"; label: string; icon: typeof LayoutGrid }[] = [
  { type: "grid", label: "Grid", icon: LayoutGrid },
  { type: "board", label: "Board", icon: Kanban },
  { type: "calendar", label: "Calendar", icon: CalendarDays },
  { type: "chart", label: "Chart", icon: BarChart3 },
]

/** A key on the page that isn't typed into a field. */
function pageKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role=dialog],[data-radix-popper-content-wrapper]")))
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 639px)")
    if (!mq) return
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener?.("change", on)
    return () => mq.removeEventListener?.("change", on)
  }, [])
  return narrow
}

/**
 * The view tabs (T04): 13/510 labels with their glyphs, and one ink underline
 * that slides between them by transform. Saved views need the server, so
 * these are the four built-in views.
 */
function ViewTabs({ active, onPick }: { active: ViewChoice; onPick: (v: ViewChoice) => void }) {
  const wrap = React.useRef<HTMLDivElement>(null)
  const bar = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-view="${active}"]`)
    const b = bar.current
    if (!el || !b) return
    // A 100 px bar scaled to the tab, so only transform moves.
    b.style.transform = `translateX(${el.offsetLeft + 4}px) scaleX(${(el.offsetWidth - 8) / 100})`
    b.dataset.on = "true"
  }, [active])
  return (
    <div ref={wrap} className="relative flex h-10 items-stretch gap-1 overflow-x-auto" role="group" aria-label="View">
      {VIEW_TABS.map((tab) => {
        const Icon = tab.icon
        const on = active === tab.type
        return (
          <button
            key={tab.type}
            type="button"
            data-view={tab.type}
            data-touch-target=""
            onClick={() => onPick(tab.type)}
            aria-pressed={on}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ui-sm font-medium outline-none transition-colors focus-visible:bg-hover",
              on ? "text-ink [&>svg]:text-ink-2" : "text-ink-3 hover:text-ink-2 [&>svg]:text-ink-4",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" /> {tab.label}
          </button>
        )
      })}
      <span
        ref={bar}
        aria-hidden="true"
        data-tab-indicator=""
        data-on="false"
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-[100px] origin-left rounded-[1px] bg-ink opacity-0 transition-transform duration-200 ease-out data-[on=true]:opacity-100"
      />
    </div>
  )
}

export default function TableDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const confirm = useConfirm()
  const tableId = String(params["table-id"] || "")
  const { toast } = useToast()

  // The bundle, and every row the page holds past its first 500, kept live.
  const held = useTableRows(tableId)
  usePageName(held.bundle?.table?.name)
  const { bundle, isLoading, isError, refresh } = held
  const reload = React.useCallback(() => void refresh(), [refresh])
  // A change to one row asks for that row's page; one without, for everything held.
  const changed = React.useCallback((rowId?: string) => void refresh(rowId), [refresh])

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  // The view is in the address (?view=board), so a reload or a shared link
  // opens the same one; replaceState, not a navigation.
  const [activeView, setActiveView] = React.useState<ViewChoice>(() => viewFromQuery(searchParams.get("view")))
  const showView = React.useCallback((view: ViewChoice) => {
    setActiveView(view)
    const url = new URL(window.location.href)
    if (view === "grid") url.searchParams.delete("view")
    else url.searchParams.set("view", view)
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const [calendarMonth, setCalendarMonth] = React.useState(() => monthOf(new Date()))
  const [publishing, setPublishing] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  const [openRow, setOpenRowState] = React.useState<string | null>(() => searchParams.get("row"))
  const setOpenRow = React.useCallback((id: string | null) => {
    setOpenRowState(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("row", id)
    else url.searchParams.delete("row")
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const [query, setQuery] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const exporting = React.useRef(false)
  const [saveState, setSaveState] = React.useState<SaveState>("saved")
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)
  const narrow = useNarrow()

  React.useEffect(() => {
    if (bundle?.table) {
      setName(bundle.table.name)
      setDescription(bundle.table.description || "")
    }
  }, [bundle?.table?.name, bundle?.table?.description]) // eslint-disable-line react-hooks/exhaustive-deps

  // A cheap signature of the row set so the Chart view re-aggregates when
  // rows change. Above the early returns, with every other hook.
  const chartDataVersion = React.useMemo(() => {
    let latest = ""
    for (const r of held.rows) if (r.updated_at > latest) latest = r.updated_at
    return `${held.total ?? held.rows.length}:${latest}`
  }, [held.rows, held.total])

  // Sort and filter: this reader's, for this table, kept in their browser.
  const [rules, setRules] = React.useState<ViewRules>(NO_RULES)
  const fieldsKnown = !!bundle?.fields
  React.useEffect(() => {
    if (fieldsKnown && bundle?.fields) setRules(loadViewRules(tableId, bundle.fields))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per table, when its fields arrive
  }, [tableId, fieldsKnown])
  const changeRules = React.useCallback(
    (next: ViewRules) => {
      setRules(next)
      saveViewRules(tableId, next)
    },
    [tableId],
  )
  React.useEffect(() => {
    if (!bundle?.fields) return
    setRules((r) => fitRules(r, bundle.fields))
  }, [bundle?.fields])

  // How this reader looks at the table: row height, hidden fields, widths,
  // summaries, list mode on a phone.
  const [display, setDisplay] = React.useState<TableDisplay>(DEFAULT_DISPLAY)
  React.useEffect(() => setDisplay(loadDisplay(tableId)), [tableId])
  const changeDisplay = React.useCallback(
    (patch: Partial<TableDisplay>) => {
      setDisplay((d) => {
        const next = { ...d, ...patch }
        saveDisplay(tableId, next)
        return next
      })
    },
    [tableId],
  )

  const ruled = React.useMemo(() => applyViewRules(held.rows, bundle?.fields || [], rules), [held.rows, bundle?.fields, rules])
  // A row just made here stays in sight, last, until the person moves on, even
  // where the view's filter or the search would hide it, or its sort put it
  // elsewhere: R seemed to do nothing, and people pressed it again
  // (TAB-BUG-14). A toast says why it's out of place; the row is marked.
  const [added, setAdded] = React.useState<string | null>(null)
  const { rows: shownRows, kept } = React.useMemo(() => keepInSight(searchRows(ruled, query), ruled, held.rows, added), [ruled, query, held.rows, added])
  const keptNote = kept ? KEPT_NOTE[kept] : null
  const toldFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!added || !keptNote || toldFor.current === added) return
    toldFor.current = added
    toast({ title: keptNote, description: "Your new row stays here until you move on." })
  }, [added, keptNote, toast])
  React.useEffect(() => setAdded(null), [rules, query])
  React.useEffect(() => {
    if (openRow) setAdded((a) => (a === openRow ? a : null))
  }, [openRow])
  const leftRow = React.useCallback((rowId: string) => setAdded((a) => (a === rowId ? a : null)), [])
  const clearFilters = React.useCallback(() => {
    changeRules({ ...rules, filters: [] })
    setQuery("")
  }, [changeRules, rules])
  const noMatch = held.rows.length > 0 && shownRows.length === 0
  // No hit among the rows read is the answer only once the rest are read (or
  // reading stopped at 10,000, or failed, which the toolbar says): "No rows
  // match" while they were still coming sent people to clear their filters.
  const noHit = !held.complete && !held.capped && !held.failed ? <TableViewState kind="searching" /> : <TableViewState kind="no-match" onClear={clearFilters} />

  // What the views need held: a board, a calendar, a sort, a filter or a
  // search looks at every row (up to 10,000; past that, "Load all"). The grid
  // reads a page more as it nears the end of what's held. A row the address
  // names is read on to, as far as those 10,000: past them it's said once,
  // with "Load all" (a link to a row gone read every row of the table).
  const { all: holdAll, more: holdMore } = held
  const needsAll = activeView === "board" || activeView === "calendar" || rules.sort.length + rules.filters.length > 0 || query.trim() !== ""
  React.useEffect(() => {
    if (needsAll) holdAll()
  }, [needsAll, holdAll])
  const openHeld = !!openRow && held.rows.some((r) => r.id === openRow)
  const seeking = !!openRow && !openHeld && !held.complete && !held.reading && !held.failed && !held.capped
  // Asked again as each page lands: a page that came back before "reading"
  // was ever drawn left seeking true throughout, and the reading stopped.
  const heldCount = held.rows.length
  React.useEffect(() => {
    if (seeking) holdMore()
  }, [seeking, holdMore, heldCount])
  const pastHeld = !!openRow && !openHeld && held.capped
  const toldPast = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!pastHeld || !openRow || toldPast.current === openRow) return
    toldPast.current = openRow
    toast({
      title: `This row isn't among the first ${formatLocale(ROWS_HELD_MAX, {})} loaded`,
      action: (
        <ToastAction altText="Load every row" onClick={() => holdAll(true)}>
          Load all
        </ToastAction>
      ),
    })
  }, [pastHeld, openRow, toast, holdAll])

  const onSaving = React.useCallback((n: number) => {
    if (n > 0) setSaveState("saving")
    else {
      setSaveState("saved")
      setSavedAt(new Date())
    }
  }, [])
  const commit = useCellCommit({ tableId, rows: held.rows, onChange: changed, onSaving })

  // Rows made here are the table's last: they're read through to, and a new
  // one is brought into sight: its first cell takes the focus in the grid, on
  // every device; the phone's list scrolls to it and opens its record, as the
  // board and the calendar open theirs. Past the first 10,000 rows it's said,
  // with "Load all", which reads every row and then goes to it.
  const [focusRow, setFocusRow] = React.useState<string | null>(null)
  const [listTo, setListTo] = React.useState<string | null>(null)
  const listMode = narrow && activeView === "grid" && (display.list ?? listByDefault(bundle?.fields || []))
  const { reveal } = held
  const bringIn = React.useCallback(
    (id: string) => {
      setAdded(id)
      if (activeView === "grid" && !listMode) return setFocusRow(id)
      if (listMode) setListTo(id)
      setOpenRow(id)
    },
    [activeView, listMode, setOpenRow],
  )
  const onCreated = React.useCallback(
    (rows: TableRow[], focus = false) => {
      if (!rows.length) return
      const shown = reveal(rows)
      if (!focus) return
      const id = rows[0].id
      if (shown) return bringIn(id)
      toast({
        title: `Added as the last row, past the first ${formatLocale(ROWS_HELD_MAX, {})} loaded`,
        action: (
          <ToastAction
            altText="Load every row, and go to the new one"
            onClick={() => {
              holdAll(true)
              bringIn(id)
            }}
          >
            Load all
          </ToastAction>
        ),
      })
    },
    [reveal, bringIn, toast, holdAll],
  )
  const addRow = React.useCallback(async () => {
    try {
      const r = await createRow(tableId, {})
      if (r?.id) onCreated([r], true)
    } catch {
      // surfaced
    }
  }, [tableId, onCreated])
  const focused = React.useCallback(() => setFocusRow(null), [])
  const nearEnd = React.useCallback(() => holdMore(), [holdMore])

  // R adds a row, / searches (T05).
  React.useEffect(() => {
    if (!bundle?.table) return
    const onKey = (e: KeyboardEvent) => {
      if (!pageKey(e) || openRow) return
      if ((e.key === "r" || e.key === "R") && activeView === "grid") {
        e.preventDefault()
        void addRow()
      } else if (e.key === "/") {
        e.preventDefault()
        setSearching(true)
        requestAnimationFrame(() => searchRef.current?.focus())
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [bundle?.table, activeView, addRow, openRow])

  // Only what changed: the rest of this page's copy may be out of date.
  const saveTable = async (change: { name?: string; description?: string; visibility?: Visibility }) => {
    if (!bundle?.table || !bundle.can_manage) return
    const t = bundle.table
    setSaveState("saving")
    try {
      await updateTable(tableId, change)
      await held.refreshTable()
      setSaveState("saved")
      setSavedAt(new Date())
    } catch {
      setSaveState("failed")
      setName(t.name)
      setDescription(t.description || "")
    }
  }

  const commitName = () => {
    const trimmed = name.trim()
    if (!bundle?.table || !trimmed || trimmed === bundle.table.name) {
      setName(bundle?.table.name || "")
      return
    }
    void saveTable({ name: trimmed })
  }
  const commitDescription = () => {
    if (!bundle?.table) return
    const next = description.trim()
    if (next === (bundle.table.description || "")) return
    void saveTable({ description: next })
  }

  if (isLoading) {
    return <TablePageSkeleton view={activeView} />
  }

  if (!bundle?.table) {
    // Not yours, gone, or not loaded, said as every screen says it
    // (LoadFailureState): a dropped connection isn't a missing table.
    return <LoadFailureState error={isError} noun="table" onRetry={reload} back={{ label: "Back to tables", href: "/app/tables" }} className="pt-20" />
  }

  const t = bundle.table
  const fields = bundle.fields || []
  const rows = held.rows
  const sortedFields = [...fields].sort((a, b) => a.position - b.position)
  const hidden = new Set(display.hidden)

  // Stable payload the templates gallery replays on install (structure only).
  const templatePayload = {
    table: { name: t.name, description: t.description || undefined, icon: t.icon || undefined, visibility: t.visibility },
    fields: sortedFields.map((f) => ({ name: f.name, type: f.type, config: parseFieldConfig(f), position: f.position })),
    views: (bundle.views || []).map((v) => ({ name: v.name, type: v.type, config: parseViewConfig(v), position: v.position })),
  }

  // Every row the view shows, not only those the page holds: the rest are read
  // first, page by page, with a toast that counts them.
  const exportCsv = async () => {
    if (exporting.current) return
    exporting.current = true
    const n = (x: number) => formatLocale(x, {})
    const of = held.total === null ? "" : ` of ${n(held.total)}`
    const note = held.complete ? null : toast({ tone: "loading", title: "Exporting the table", description: `Reading rows: 0${of}` })
    try {
      const every = held.complete
        ? rows
        : await readEveryRow(tableId, { onProgress: (got) => note?.update({ id: note.id, tone: "loading", title: "Exporting the table", description: `Reading rows: ${n(got)}${of}` }) })
      const out = searchRows(applyViewRules(every, fields, rules), query)
      const blob = new Blob([toCsv(sortedFields.filter((f) => !hidden.has(f.id)), out)], { type: "text/csv;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `${t.name || "table"}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      note?.update({ id: note.id, tone: "success", title: `Exported ${n(out.length)} ${out.length === 1 ? "row" : "rows"}`, description: undefined })
    } catch {
      note?.update({ id: note.id, tone: "error", variant: "destructive", title: "Couldn't export the table", description: "Not every row could be read. Try again." })
    } finally {
      exporting.current = false
    }
  }

  const removeTable = () =>
    confirm({
      title: `Delete the table "${t.name}"?`,
      description: "Its rows and columns are removed for everyone. This can't be undone.",
      confirmText: "Delete table",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteTable(tableId)
          router.push("/app/tables")
        } catch {
          // surfaced
        }
      },
    })

  const toolbarEnd = (
    <>
      {searching || query ? (
        <label className="flex h-7 w-44 items-center gap-1.5 rounded-lg bg-raised px-2 text-ui-sm shadow-e1 focus-within:ring-1 focus-within:ring-brand/50 max-sm:w-32">
          <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => !query && setSearching(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("")
                setSearching(false)
              }
            }}
            aria-label="Search rows"
            placeholder="Search rows"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
          />
          {query ? (
            <button type="button" aria-label="Clear the search" onClick={() => setQuery("")} className="text-ink-3 hover:text-ink">
              <X className="size-3" />
            </button>
          ) : null}
        </label>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label="Search rows (/)" onClick={() => setSearching(true)}>
          <Search className="size-3.5" />
        </Button>
      )}
      {activeView === "grid" ? (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("h-7 gap-1.5 px-2 text-ui-sm", hidden.size ? "text-ink" : "text-ink-2")}>
                <EyeOff className="size-3.5" /> <span className="max-sm:hidden">{hidden.size ? `${hidden.size} hidden` : "Fields"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="content-float w-64 rounded-xl p-1 shadow-e3">
              <p className="flex h-7 items-center px-2 text-meta font-medium text-ink-3">Fields</p>
              {sortedFields.map((f, i) => {
                const G = FIELD_GLYPH[f.type] ?? FIELD_GLYPH.text
                const off = hidden.has(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={i === 0}
                    onClick={() => changeDisplay({ hidden: off ? display.hidden.filter((h) => h !== f.id) : [...display.hidden, f.id] })}
                    className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-ui text-ink hover:bg-press disabled:cursor-default disabled:hover:bg-transparent", TOUCH_ROW)}
                  >
                    <G className="size-3.5 text-ink-3" aria-hidden />
                    <span className={cn("min-w-0 flex-1 truncate", off && "text-ink-3")}>{f.name}</span>
                    {i === 0 ? <span className="text-meta text-ink-3">Primary</span> : off ? <EyeOff className="size-3.5 text-ink-3" aria-label="Hidden" /> : <Eye className="size-3.5 text-ink-3" aria-label="Shown" />}
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Row height" className="text-ink-2">
                <SlidersHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="content-float w-44 rounded-xl p-1 shadow-e3">
              <p className="flex h-7 items-center px-2 text-meta font-medium text-ink-3">Row height</p>
              {ROW_HEIGHTS.map((h) => (
                <DropdownMenuItem key={h.value} onSelect={() => changeDisplay({ rowHeight: h.value })} className={cn(display.rowHeight === h.value && "font-medium text-ink")}>
                  <span className="flex-1">{h.label}</span>
                  <span className="text-meta text-ink-3">{h.px}</span>
                </DropdownMenuItem>
              ))}
              {narrow ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => changeDisplay({ list: !listMode })}>
                    <List /> {listMode ? "Show as a grid" : "Show as a list"}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => void addRow()} className="ml-1 gap-1.5" aria-label="New row">
            <Plus className="size-3.5" /> <span className="max-sm:hidden">New row</span>
            <kbd className="kbd max-sm:hidden">R</kbd>
          </Button>
        </>
      ) : null}
      {activeView === "board" ? <BoardGroupBy fields={fields} groupFieldId={display.boardGroup ?? undefined} onPick={(id) => changeDisplay({ boardGroup: id })} /> : null}
      {activeView === "calendar" && fields.some((f) => f.type === "date") ? <CalendarMonthNav month={calendarMonth} onMonth={setCalendarMonth} /> : null}
    </>
  )

  return (
    <div className="flex min-h-full flex-col" data-table-page="">
      {/* The header row (T03): breadcrumb and save dot, then Share and More. */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-ui-sm">
          <Link
            href="/app/tables"
            aria-label="Back to tables"
            className="hidden shrink-0 rounded-md px-1.5 py-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink sm:inline-flex"
          >
            Tables
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-ink-4 sm:block" aria-hidden="true" />
          {/* On a phone the name is the hero's alone, under the app's bar. */}
          <span className="truncate px-1 font-medium text-ink max-sm:hidden">{t.name}</span>
          <SaveDot state={saveState} savedAt={savedAt ?? new Date(t.updated_at)} onRetry={reload} className="ml-1" />
        </nav>
        {bundle.can_manage && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setSharing(true)} className="gap-1.5" aria-label="Share" title="Share externally">
              <Share2 className="size-3.5" /> <span className="max-sm:hidden">Share</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="content-float w-56 rounded-xl p-1 shadow-e3">
                <DropdownMenuItem onSelect={() => void saveTable({ visibility: t.visibility === "workspace" ? "private" : "workspace" })}>
                  {t.visibility === "workspace" ? <Lock /> : <Globe />}
                  <span className="flex-1">{t.visibility === "workspace" ? "Make private" : "Show to the workspace"}</span>
                  <span className="text-meta text-ink-3">{t.visibility === "workspace" ? "Workspace" : "Private"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPublishing(true)}>
                  <LayoutTemplate /> Save as template
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportCsv()}>
                  <Download /> Export CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={removeTable} className="text-danger-ink focus:text-danger-ink">
                  <Trash2 /> Delete table
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6">
        {/* The hero: the tile, the name in Inter Display and what it's for. */}
        <div className="flex items-start gap-3 pb-3 pt-3 sm:pt-5">
          <TableGlyph size="lg" icon={t.icon} id={t.id} />
          <div className="min-w-0 flex-1">
            {bundle.can_manage ? (
              // The page's heading still, for a manager who can rename it.
              <h1>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => e.key === "Enter" && !isComposingKey(e.nativeEvent) && e.currentTarget.blur()}
                  aria-label="Table name"
                  className="-mx-1 block w-full truncate rounded-md border-b border-transparent bg-transparent px-1 font-display text-title-1 text-ink outline-none hover:bg-hover focus:bg-transparent"
                  maxLength={120}
                />
              </h1>
            ) : (
              <h1 className="truncate font-display text-title-1 text-ink">{t.name}</h1>
            )}
            {bundle.can_manage ? (
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={commitDescription}
                onKeyDown={(e) => e.key === "Enter" && !isComposingKey(e.nativeEvent) && e.currentTarget.blur()}
                aria-label="What this table is for"
                placeholder="Add a description"
                className="-mx-1 mt-0.5 block w-full truncate rounded-md bg-transparent px-1 text-ui text-ink-2 outline-none placeholder:text-ink-3 hover:bg-hover focus:bg-transparent"
                maxLength={500}
              />
            ) : t.description ? (
              <p className="mt-0.5 truncate text-ui text-ink-2">{t.description}</p>
            ) : null}
            {bundle.can_manage ? null : (
              // Its column menus open read-only, and nothing said why (QA PTC-62).
              <p className="mt-0.5 text-meta text-ink-3" data-rows-only="">
                You can edit its rows. Its owner changes its columns.
              </p>
            )}
          </div>
        </div>

        <ViewTabs active={activeView} onPick={showView} />

        {/* One frame for every view (TableViewFrame): the toolbar row, then a
            body that scrolls inside the frame, and one place where a view
            says it has nothing to show. No box: the views sit on the sheet. */}
        <div className="flex min-h-0 flex-1 flex-col" data-table-frame="">
          {/* The chart has its own choices in the same toolbar row. */}
          {activeView !== "chart" && <ViewRulesBar
            fields={sortedFields}
            rules={rules}
            onChange={changeRules}
            shown={shownRows.length}
            held={rows.length}
            total={held.total}
            loading={held.complete ? null : { reading: held.reading, failed: held.failed, onLoadAll: () => held.all(true), onRetry: held.retry }}
            end={toolbarEnd}
          />}
          {activeView === "grid" &&
            (listMode ? (
              <div>
                <TableRowList
                  fields={fields}
                  rows={shownRows}
                  onOpen={setOpenRow}
                  onNearEnd={held.complete ? undefined : nearEnd}
                  scrollTo={listTo}
                  empty={rows.length === 0 ? <TableViewState kind="no-rows" hue={hueFor(tableId)} /> : noHit}
                />
              </div>
            ) : (
              <DataTableGrid
                tableId={tableId}
                fields={fields}
                rows={shownRows}
                canManage={bundle.can_manage}
                onChange={reload}
                onCreated={onCreated}
                focusRow={focusRow}
                onFocused={focused}
                marked={added && keptNote ? { rowId: added, note: keptNote } : null}
                onRowFocus={leftRow}
                onNearEnd={held.complete ? undefined : nearEnd}
                commit={commit}
                rowHeight={display.rowHeight}
                hidden={display.hidden}
                widths={display.widths}
                onWidth={(id, px) => changeDisplay({ widths: { ...display.widths, [id]: px } })}
                summary={display.summary}
                onSummary={(id, fn) => changeDisplay({ summary: { ...display.summary, [id]: fn } })}
                loaded={held.complete ? undefined : held.rows.length}
                onSort={(id, dir) => changeRules({ ...rules, sort: [{ field: id, dir }, ...rules.sort.filter((s) => s.field !== id)].slice(0, 3) })}
                onFilter={(id) => {
                  const f = fields.find((x) => x.id === id)
                  if (f) changeRules({ ...rules, filters: [...rules.filters, { field: id, op: OPS_FOR[kindOfField(f)][0].op, value: "" }] })
                }}
                onHide={(id) => changeDisplay({ hidden: [...display.hidden, id] })}
                onOpenRow={setOpenRow}
                compact={narrow}
                empty={
                  rows.length === 0 ? (
                    // In the table's own hue, the one its icon wears.
                    <TableViewState kind="no-rows" hue={hueFor(tableId)} />
                  ) : (
                    noHit
                  )
                }
              />
            ))}
          {(activeView === "board" || activeView === "calendar") && noMatch ? (
            noHit
          ) : activeView === "board" ? (
            <DataTableBoard
              tableId={tableId}
              fields={fields}
              rows={shownRows}
              canManage={bundle.can_manage}
              groupFieldId={display.boardGroup ?? undefined}
              onChange={changed}
              onCreated={onCreated}
              onOpenRow={setOpenRow}
              onOpenGrid={() => showView("grid")}
            />
          ) : activeView === "calendar" ? (
            <DataTableCalendar
              tableId={tableId}
              fields={fields}
              rows={shownRows}
              canManage={bundle.can_manage}
              onChange={reload}
              onCreated={onCreated}
              month={calendarMonth}
              onOpenGrid={() => showView("grid")}
              onOpenRow={setOpenRow}
              compact={narrow}
            />
          ) : null}
          {activeView === "chart" && <DataTableChart tableId={tableId} fields={fields} dataVersion={chartDataVersion} />}
        </div>
      </div>

      {openRow && shownRows.some((r) => r.id === openRow) ? (
        <RecordPanel
          tableId={tableId}
          tableName={t.name}
          fields={fields}
          rows={shownRows}
          rowId={openRow}
          canManage={bundle.can_manage}
          commit={commit}
          onStep={setOpenRow}
          onClose={() => setOpenRow(null)}
          onChange={reload}
        />
      ) : null}

      <PublishTemplateDialog open={publishing} onOpenChange={setPublishing} kind="table" payload={templatePayload} defaultName={t.name} defaultIcon={t.icon || undefined} />

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-heading">Share “{t.name}”</DialogTitle>
            <DialogDescription>Give people outside your workspace a read-only link to this table.</DialogDescription>
          </DialogHeader>
          <GuestLinkSection resourceType="table" resourceId={tableId} canShare={bundle.can_manage} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * The table page's shape while it loads: its header, hero, views, toolbar
 * and the view the address names, at their real size, so nothing moves when
 * the table arrives.
 */
function TablePageSkeleton({ view = "grid" }: { view?: ViewChoice }) {
  return (
    <div className="flex flex-col" role="status" aria-label="Loading table" data-table-skeleton={view}>
      <div className="flex h-[52px] items-center px-4 sm:px-6" aria-hidden="true">
        <Skeleton className="h-3.5 w-40 rounded" />
      </div>
      <div className="px-4 sm:px-6" aria-hidden="true">
        <div className="flex items-start gap-3 pb-3 pt-3 sm:pt-5">
          <Skeleton className="size-9 shrink-0 rounded-[10px]" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-6 w-56 rounded" />
            <Skeleton className="h-3.5 w-72 rounded" />
          </div>
        </div>
        <div className="flex h-10 items-center gap-5 px-2.5">
          <Skeleton className="h-3.5 w-12 rounded" />
          <Skeleton className="h-3.5 w-14 rounded" />
          <Skeleton className="h-3.5 w-20 rounded" />
          <Skeleton className="h-3.5 w-14 rounded" />
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <Skeleton className="h-3.5 w-14 rounded" />
          <Skeleton className="h-3.5 w-12 rounded" />
        </div>
        {view === "board" ? (
          <div className={cn("flex gap-3", TABLE_VIEW_INSET)}>
            {[3, 2, 1].map((cards, c) => (
              <div key={c} className="w-72 shrink-0 space-y-2 rounded-[16px] bg-sunken p-2">
                <Skeleton className="m-1 h-5 w-20 rounded" />
                {Array.from({ length: cards }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </div>
        ) : view === "calendar" ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[96px] border-b border-r border-line p-1 [&:nth-child(7n)]:border-r-0">
                <Skeleton className="h-3 w-4 rounded" />
              </div>
            ))}
          </div>
        ) : view === "chart" ? (
          <div className={TABLE_VIEW_INSET}>
            <div className="flex h-[18rem] items-end gap-6 px-6">
              {[62, 88, 45, 70, 30].map((h, i) => (
                <Skeleton key={i} className="w-full max-w-12 rounded-b-none" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ) : (
          Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex h-10 items-center gap-6 border-b border-line px-3">
              <Skeleton className={cn("h-3 rounded", i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-32" : "w-48")} />
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="hidden h-3 w-24 rounded sm:block" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
