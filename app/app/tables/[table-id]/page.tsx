"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  ChevronRight,
  ClipboardList,
  Share2,
  MoreHorizontal,
  RotateCcw,
  Search,
  EyeOff,
  Plus,
  SlidersHorizontal,
  X,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { DataTableGrid, SelectionPart } from "@/components/table/DataTableGrid"
import { BoardPart, CalendarPart, ChartPart, FormsPart, GalleryPart, ListPart, TimelinePart, MenusPart, PresencePart, RecordPart, RulesPart, SaveDotPart, SharePart, TrashPart, ViewsPart, warmView } from "@/components/table/lazyParts"
import { warmCellPickers } from "@/components/table/cellPickerPart"
import { monthOf } from "@/lib/tables/month"
import {
  createRow,
  rowsByIds,
  updateTable,
  Visibility,
  type TableRow,
} from "@/services/tableService"
import { filterCount, fitRules, freshFilter, groupingOf, keepInSight, KEPT_NOTE, loadViewRules, MAX_FILTERS, namesMe, NO_RULES, saveViewRules, searchRows, withoutComputed, type ViewRules } from "@/lib/tables/viewRules"
import { ROWS_HELD_MAX } from "@/lib/tables/useTableRows"
import { useRowWindow } from "@/hooks/useRowWindow"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { usePageName } from "@/lib/utils/pageName"
import { fieldKeyDown, isComposingKey } from "@/lib/keys/ime"
import { ToastAction } from "@/components/ui/toast"
import { formatLocale } from "@/lib/tables/numberFormat"
import { ViewRulesBar } from "@/components/table/ViewRulesBar"
import { TableGlyph } from "@/components/table/TableGlyph"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { TableViewState, TABLE_VIEW_INSET } from "@/components/table/TableViewFrame"
import { hueFor, type CampHue } from "@/lib/campHue"
import { rowsView, viewFromQuery, type ViewChoice } from "@/lib/tables/tableView"
import type { SaveState } from "@/components/docEditor/SaveDot"
import { DEFAULT_DISPLAY, listByDefault, loadDisplay, saveDisplay, type TableDisplay } from "@/lib/tables/display"
import { useCellCommit } from "@/lib/tables/useCellCommit"
import { tablesPath } from "@/lib/tables/route"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { undoneNote } from "@/lib/tables/undoneNote"
import { onMac, undoKey } from "@/lib/tables/undoKeys"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { focusCarry } from "@/lib/ui/focusCarry"
import { ix } from "@/lib/ui/interactive"
import { VIEW_LAYOUTS } from "@/components/table/viewLayouts"
import { VIEW_TRIGGER, ViewFace } from "@/components/table/views/ViewFace"

/** The page's dropdown menus' chunk (lazyParts' MenusPart). */
type Menus = typeof import("@/components/table/TableMenus")

/** The rows a list or a grid draws while it waits. */
const SKELETON_ROWS = 9
const NO_SHUT: string[][] = []


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
 * The layout tabs (T04): 13/510 labels with glyphs (a phone's glyphs alone,
 * named for screen readers, so all fit) under one ink underline that slides
 * by transform; in the table's hue, with the focus ring (TB-19) and a 44px
 * tap. A saved view (TableViews) keeps one.
 */
function ViewTabs({ active, onPick, hue, onForms }: { active: ViewChoice; onPick: (v: ViewChoice) => void; hue: CampHue; onForms?: () => void }) {
  const narrow = useNarrow()
  const wrap = React.useRef<HTMLDivElement>(null)
  const bar = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-view="${active}"]`)
    const b = bar.current
    if (!el || !b) return
    // A 100 px bar scaled to the tab, so only transform moves.
    b.style.transform = `translateX(${el.offsetLeft + 4}px) scaleX(${(el.offsetWidth - 8) / 100})`
    b.dataset.on = "true"
  }, [active, narrow])
  return (
    <div ref={wrap} data-hue={hue} data-edge-fade="" className="relative flex h-10 min-w-0 items-center gap-1 overflow-x-auto" role="group" aria-label="View">
      {VIEW_LAYOUTS.map((tab) => {
        const Icon = tab.icon
        const on = active === tab.type
        return (
          <button
            key={tab.type}
            type="button"
            data-view={tab.type}
            data-touch-target=""
            onClick={() => onPick(tab.type)}
            onPointerEnter={() => warmView(tab.type)}
            onFocus={() => warmView(tab.type)}
            aria-pressed={on}
            {...ix("tab")}
            className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ui-sm font-medium", on ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            <Icon className="size-3.5" aria-hidden="true" /> <span className="max-sm:sr-only">{tab.label}</span>
          </button>
        )
      })}
      {/* The table's forms (B5), for its managers: a form is the view visitors fill, so it sits with the layouts. */}
      {onForms ? (
        <button
          type="button"
          data-view-forms=""
          data-touch-target=""
          aria-haspopup="dialog"
          onClick={onForms}
          {...ix("tab")}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ui-sm font-medium text-ink-3 hover:text-ink-2"
        >
          <ClipboardList className="size-3.5" aria-hidden="true" /> <span className="max-sm:sr-only">Form</span>
        </button>
      ) : null}
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
  const searchParams = useSearchParams()
  const tableId = String(params["table-id"] || "")
  const { toast } = useToast()

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
  const [query, setQuery] = React.useState("")
  // Sort and filter: this reader's, for this table, kept in their browser,
  // and read once its fields are known (rulesFor).
  const [rules, setRules] = React.useState<ViewRules>(NO_RULES)
  const [rulesFor, setRulesFor] = React.useState<string | null>(null)
  // Who "me" is in a people filter, as the server reads it for its windows.
  const profile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = profile.data?.data?.user_uuid ?? null

  // How this reader looks at the table: row height, hidden fields, widths,
  // summaries, list mode on a phone.
  const [display, setDisplay] = React.useState<TableDisplay>(DEFAULT_DISPLAY)

  // The bundle, and the view's rows, kept live: the grid and the phone's list
  // without a search read the server's windows of the view, in its order
  // (tables T5c), once the reader's rules for the table are known; every
  // other view, the rows the page holds past the bundle's first 500.
  const grouping = groupingOf(rules.groups ?? [])
  const shut = display.shut[grouping] ?? NO_SHUT
  const held = useRowWindow(tableId, { rules, windows: rulesFor === tableId && rowsView(activeView) && !query.trim(), summary: display.summary, hidden: display.hidden, shut, colors: display.colors })
  const windowed = held.windowed
  usePageName(held.bundle?.table?.name)
  const { bundle, isLoading, isError, refresh } = held
  // A row's record and a cell's picker are a click away: their chunks load
  // once the table is drawn and the page is idle.
  const loaded = !!bundle
  React.useEffect(() => {
    if (!loaded) return
    const warm = () => {
      void RecordPart.prefetch()
      void SelectionPart.prefetch()
      warmCellPickers()
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm)
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(id)
  }, [loaded])
  const reload = React.useCallback(() => void refresh(), [refresh])
  // A change to one row asks for that row's page; one without, for everything held.
  const changed = React.useCallback((rowId?: string) => void refresh(rowId), [refresh])
  const { put } = held
  // A row read alone for its record (lone, below) is put back too.
  const [lone, setLone] = React.useState<TableRow | null>(null)
  const putSaved = React.useCallback(
    (row: TableRow) => {
      put([row])
      setLone((l) => (l && l.id === row.id ? row : l))
    },
    [put],
  )

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [calendarMonth, setCalendarMonth] = React.useState(() => monthOf(new Date()))
  const [sharing, setSharing] = React.useState(false)
  // The table's own forms (B5): opened once their chunk is here, or said when it can't come.
  const [forms, setForms] = React.useState(false)
  const openForms = () =>
    void FormsPart.warm().then(
      () => setForms(true),
      () => toast({ title: "Couldn't open the forms. Try again.", variant: "destructive" }),
    )
  const [trashOpen, setTrashOpen] = React.useState(false)
  const [openRow, setOpenRowState] = React.useState<string | null>(() => searchParams.get("row"))
  // A thread on the open row a link named (a notice, a copied link): its
  // record opens at it, once; stepping to another row lets go of it.
  const [openThread, setOpenThread] = React.useState<string | null>(() => searchParams.get("thread"))
  const setOpenRow = React.useCallback((id: string | null) => {
    setOpenRowState(id)
    setOpenThread(null)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("row", id)
    else url.searchParams.delete("row")
    url.searchParams.delete("thread")
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const [searching, setSearching] = React.useState(false)
  // Which of the page's dropdown menus is open (TableMenus, a chunk of its own).
  const [menu, setMenu] = React.useState<"more" | "height" | "fields" | null>(null)
  const [carryFocus] = React.useState(focusCarry)
  const warmMenus = React.useCallback(() => void MenusPart.prefetch(), [])
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

  const fieldsKnown = !!bundle?.fields
  React.useEffect(() => {
    if (!fieldsKnown || !bundle?.fields) return
    setRules(loadViewRules(tableId, bundle.fields))
    setRulesFor(tableId)
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

  React.useEffect(() => setDisplay(loadDisplay(tableId)), [tableId])
  const changeDisplay = React.useCallback(
    (patch: Partial<TableDisplay> | ((d: TableDisplay) => Partial<TableDisplay>)) => {
      setDisplay((d) => {
        const next = { ...d, ...(typeof patch === "function" ? patch(d) : patch) }
        saveDisplay(tableId, next)
        return next
      })
    },
    [tableId],
  )
  // A saved view, from the views menu.
  const applyView = React.useCallback(
    (v: { layout: ViewChoice; rules: ViewRules; display: Partial<TableDisplay> }) => {
      showView(v.layout)
      changeRules(v.rules)
      changeDisplay(v.display)
    },
    [showView, changeRules, changeDisplay],
  )
  // At once: a link to a view shows it before the table paints.
  React.useEffect(() => void ViewsPart.prefetch(), [])
  // A view's link (?v=) paints in its layout from the table's first frame: the bundle lists the views.
  const linked = bundle?.views?.find((v) => v.id === searchParams.get("v"))
  const linkedLayout = linked?.type
  React.useLayoutEffect(() => void (linkedLayout && setActiveView(linkedLayout)), [linkedLayout])

  // The server's windows come ruled, in the view's order: the browser applies
  // the rules only to the rows the page holds, with the rules' own chunk,
  // which loads beside the bundle. Until it lands, such a view draws its
  // skeleton, never rows its rules would hide; so does one whose rules name
  // me until the profile says who that is. A chart reads no rows here.
  const applying = RulesPart.useLoaded()
  const awaitingMe = profile.isLoading && namesMe(rules.filters)
  const ruling = !windowed && (!applying || awaitingMe) && activeView !== "chart"
  const ruled = React.useMemo(
    () => (windowed ? held.rows : applying && !awaitingMe ? applying.applyViewRules(held.rows, bundle?.fields || [], rules, me) : []),
    [windowed, applying, awaitingMe, held.rows, bundle?.fields, rules, me],
  )
  // A row just made here stays in sight, last and marked, until the person
  // moves on, even where the filter, the search or the sort would put it
  // elsewhere (TAB-BUG-14: R seemed to do nothing); a toast says why. Under
  // windows the view holds it at its end (useTableRows' tail; keptReason).
  const [added, setAdded] = React.useState<string | null>(null)
  const { rows: shownRows, kept: keptHeld } = React.useMemo(
    () => (windowed ? { rows: held.rows, kept: null } : keepInSight(searchRows(ruled, query), ruled, held.rows, added)),
    [windowed, ruled, query, held.rows, added],
  )
  const addedRow = windowed && added && held.tail ? held.rows.slice(held.rows.length - held.tail).find((r) => r.id === added) : undefined
  const keptWindowed = React.useMemo(
    () => (addedRow && applying ? applying.keptReason(addedRow, bundle?.fields || [], rules, me) : null),
    [addedRow, applying, bundle?.fields, rules, me],
  )
  const kept = windowed ? keptWindowed : keptHeld
  // A grid grouped (V2b): the server's counts, or the rows' held here (a row kept last after every group); past 1,000 none, and why.
  const grouped = (activeView === "grid" || activeView === "list") && !!rules.groups
  const heldGroups = React.useMemo(
    () => (grouped && !windowed && applying ? applying.groupRows(keptHeld ? shownRows.slice(0, -1) : shownRows, bundle?.fields || [], rules.groups ?? []) : null),
    [grouped, windowed, applying, keptHeld, shownRows, bundle?.fields, rules.groups],
  )
  const refused = windowed ? held.refused : grouped && applying && !heldGroups ? applying.TOO_MANY_GROUPS : null
  const changeShut = React.useCallback(
    (next: string[][]) =>
      changeDisplay((d) => {
        const shut = { ...d.shut }
        delete shut[grouping]
        if (next.length) shut[grouping] = next
        return { shut }
      }),
    [changeDisplay, grouping],
  )
  const { groups: groupRules } = rules
  const { groups: counted, shutRead } = held
  // The rows held, while they aren't the whole table: the summary bar and the groups' headers say they're of these alone.
  const heldPart = held.complete ? undefined : held.rows.length
  const groupView = React.useMemo(
    () => (grouped && !refused && groupRules ? { levels: groupRules, counts: windowed ? counted : heldGroups, shut, read: windowed ? shutRead : undefined, onShut: changeShut, partial: !windowed && heldPart !== undefined } : null),
    [grouped, refused, groupRules, windowed, counted, heldGroups, shut, shutRead, changeShut, heldPart],
  )
  const keptNote = kept ? KEPT_NOTE[kept] : null
  const toldFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!added || !keptNote || toldFor.current === added) return
    toldFor.current = added
    toast({ title: keptNote, description: "Your new row stays here until you move on." })
  }, [added, keptNote, toast])
  React.useEffect(() => setAdded(null), [rules, query])
  // Moved on from the rows added here: under windows they go to their places.
  const { unpin } = held
  React.useEffect(() => {
    if (!added) unpin()
  }, [added, unpin])
  React.useEffect(() => {
    if (openRow) setAdded((a) => (a === openRow ? a : null))
  }, [openRow])
  const leftRow = React.useCallback((rowId: string) => setAdded((a) => (a === rowId ? a : null)), [])
  const clearFilters = React.useCallback(() => {
    changeRules({ ...rules, filters: [] })
    setQuery("")
  }, [changeRules, rules])
  const noMatch = !ruling && held.rows.length > 0 && shownRows.length === 0
  // The table has no rows at all: its count, since a view read in windows
  // holds none before its first window comes.
  const noRows = held.total === 0 || (held.total === null && held.rows.length === 0)
  // No hit among the rows read is the answer only once the rest are read (or
  // reading stopped at 10,000, or failed, which the toolbar says): "No rows
  // match" while they were still coming sent people to clear their filters.
  // A view the server wouldn't read (a 422, airtable-03) says why in its words,
  // and offers to clear the formula's and rollup's rules it can't answer.
  const lifted = held.stopped ? withoutComputed(rules, bundle?.fields || []) : null
  const noHit = held.workingOut ? (
    <TableViewState kind="working" words={held.workingOut.words} done={held.workingOut.done} total={held.workingOut.total} />
  ) : held.stopped && held.refused ? (
    <TableViewState kind="refused" why={held.refused} onClear={lifted ? () => changeRules(lifted) : undefined} />
  ) : windowed && held.failed ? (
    // A window that failed (offline, a 5xx, a timeout), a fill's wait included
    // (DB-42 on airtable-03b): the shared error with Try again, never "no rows match".
    <ErrorState subject="the rows" onRetry={held.retry} />
  ) : !held.complete && !held.capped && !held.failed ? (
    <TableViewState kind="searching" />
  ) : (
    <TableViewState kind="no-match" onClear={clearFilters} />
  )
  // Said once (DB-40): with no row drawn, the body says a refused view's words
  // with its button, so the toolbar says them only over rows already drawn (a
  // later window refused).
  const refusedInBody = !noRows && held.stopped && !!held.refused && held.count === 0
  // The same for a failed read with no row drawn (DB-42): the body says it,
  // with Try again, so the grid draws no row of the server's count meanwhile.
  const failedInBody = !noRows && windowed && held.failed && held.rows.length === 0
  const viewCount = failedInBody ? 0 : held.count

  // What the views need held: a board, a calendar, a sort, a filter or a
  // search looks at every row (up to 10,000; past that, "Load all"). The grid
  // reads a page more as it nears the end of what's held. A row the address
  // names is read on to, as far as those 10,000: past them it's said once,
  // with "Load all" (a link to a row gone read every row of the table).
  const { all: holdAll, more: holdMore } = held
  const needsAll = !windowed && (activeView === "board" || activeView === "calendar" || rules.sort.length + rules.filters.length > 0 || !!rules.groups || query.trim() !== "")
  React.useEffect(() => {
    if (needsAll) holdAll()
  }, [needsAll, holdAll])
  const openHeld = !!openRow && held.rows.some((r) => r.id === openRow)
  const seeking = !windowed && !!openRow && !openHeld && !held.complete && !held.reading && !held.failed && !held.capped
  // Under windows a row the address names that the windows haven't reached
  // (or that the view's rules leave out) is read alone, for its record: the
  // windows aren't read through to find it.
  const loneId = windowed && openRow && !openHeld ? openRow : null
  React.useEffect(() => {
    if (!loneId) return
    const ac = new AbortController()
    rowsByIds(tableId, [loneId], ac.signal)
      .then(([r]) => {
        if (r) setLone(r)
      })
      // Unread (or aborted), its record stays shut; its address opens it on the next load.
      .catch(() => {})
    return () => ac.abort()
  }, [loneId, tableId])
  const loneRow = loneId && lone?.id === loneId ? lone : null
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
  const commit = useCellCommit({ tableId, rows: held.rows, onChange: changed, onSaving, onSaved: putSaved })
  // Each row's colour and each cell's tint (V3), as the view colours them and its cells show them.
  const paint = React.useMemo(
    () => (applying && display.colors && rowsView(activeView) ? applying.paint(held.rows, bundle?.fields || [], display.colors, me, commit.edits, held.summaries) : null),
    [applying, display.colors, activeView, held.rows, bundle?.fields, me, commit.edits, held.summaries],
  )

  // A row made here is the table's last, read through to and brought into
  // sight: the grid focuses its first cell on every device; the phone's list,
  // the board and the calendar open its record. Past the first 10,000 rows,
  // "Load all" reads every row, then goes to it.
  const [focusAt, setFocusAt] = React.useState<{ row: string; field?: string } | null>(null)
  const [listTo, setListTo] = React.useState<string | null>(null)
  const listMode = activeView === "list" || (narrow && activeView === "grid" && (display.list ?? listByDefault(bundle?.fields || [])))
  // A phone's list is a chunk of its own: asked for once the page knows it's
  // on a phone, while the table itself is on its way.
  React.useEffect(() => {
    if (narrow) void ListPart.prefetch()
  }, [narrow])
  const { reveal } = held
  const bringIn = React.useCallback(
    (id: string) => {
      setAdded(id)
      if (activeView === "grid" && !listMode) return setFocusAt({ row: id })
      if (listMode) setListTo(id)
      setOpenRow(id)
    },
    [activeView, listMode, setOpenRow],
  )
  const onCreated = React.useCallback(
    (rows: TableRow[], focus = false) => {
      if (!rows.length) return
      // Copies made under windows go to their places in the view, read again.
      if (windowed && !focus) return void refresh()
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
    [windowed, refresh, reveal, bringIn, toast, holdAll],
  )
  const addRow = React.useCallback(async () => {
    try {
      const r = await createRow(tableId, {})
      if (r?.id) onCreated([r], true)
    } catch {
      // surfaced
    }
  }, [tableId, onCreated])
  const focused = React.useCallback(() => setFocusAt(null), [])
  // Someone's face: their cell, or their row's record where the grid doesn't show it.
  const goTo = React.useCallback(
    (row: string, field: string) => (activeView === "grid" && !listMode && shownRows.some((r) => r.id === row) ? setFocusAt({ row, field }) : setOpenRow(row)),
    [activeView, listMode, shownRows, setOpenRow],
  )

  // ⌘Z undoes the reader's latest change to the table, ⌘⇧Z redoes it (A2),
  // when they aren't typing into a field, whose text the browser undoes.
  React.useEffect(() => {
    if (!bundle?.table) return
    const mac = onMac()
    const onKey = (e: KeyboardEvent) => {
      const want = undoKey(e, mac)
      if (!want) return
      e.preventDefault()
      void (async () => {
        try {
          // The ledger loads on the first undo, off the table's first load.
          const { redoChange, undoChange } = await import("@/lib/tables/ledger")
          const r = want === "undo" ? await undoChange(tableId) : await redoChange(tableId)
          toast(undoneNote(r, want === "redo"))
        } catch (err) {
          toast({ title: apiErrorMessage(err, want === "undo" ? "Couldn't undo that" : "Couldn't redo that") })
        } finally {
          reload()
        }
      })()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [bundle?.table, tableId, toast, reload])

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
    return <LoadFailureState error={isError} noun="table" onRetry={reload} back={{ label: "Back to tables", href: tablesPath() }} className="pt-20" />
  }

  const t = bundle.table
  const fields = bundle.fields || []
  const rows = held.rows
  const openShown = !!openRow && shownRows.some((r) => r.id === openRow)
  const sortedFields = fieldOrder(fields)
  const hidden = new Set(display.hidden)

  // The export reads every row the view shows: a chunk of its own, read on
  // use, off the table's first screen.
  const exportAs = async (format: "csv" | "xlsx") => {
    if (exporting.current) return
    exporting.current = true
    try {
      // A filter on me needs who that is: a profile still on its way is read
      // first, and one that can't be read fails the export, never empties it.
      const who = me ?? (namesMe(rules.filters) ? (await profile.mutate())?.data?.user_uuid : null)
      if (who === undefined) throw new Error("the profile couldn't be read")
      const { exportRows: write } = await import("@/lib/tables/exportRows")
      await write({ format, tableId, name: t.name, shown: sortedFields.filter((f) => !hidden.has(f.id)), widths: display.widths, fields, rows, complete: held.complete, total: held.total, rules, me: who, answers: bundle.row_query, query, toast })
    } catch {
      toast({ tone: "error", variant: "destructive", title: "Couldn't export the table", description: "Check your connection and try again." })
    } finally {
      exporting.current = false
    }
  }

  // A menu's trigger, alone until the menus' chunk lands (warmed on pointer or
  // focus; an early click opens it then), then as Radix's: another node, which
  // carryFocus gives the focus the stand-in had (F7).
  const menuTrigger = (
    which: "more" | "height" | "fields",
    trigger: React.ReactElement<{ onClick?: () => void }>,
    draw: (m: Menus, trigger: React.ReactElement, open: { open: boolean; onOpenChange: (open: boolean) => void }) => React.ReactNode,
  ) => (
    <MenusPart.View
      fallback={React.cloneElement(trigger, { onClick: () => setMenu(which) })}
      render={(m) => draw(m, trigger, { open: menu === which, onOpenChange: (open) => setMenu(open ? which : null) })}
    />
  )
  const warmMore = () => {
    warmMenus()
    void TrashPart.prefetch()
  }

  const toolbarEnd = (
    <>
      {searching || query ? (
        <label className="flex h-7 w-44 items-center gap-1.5 rounded-lg bg-raised px-2 text-ui-sm shadow-e1 focus-within:focus-halo max-sm:w-32">
          <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => !query && setSearching(false)}
            data-escape-own=""
            onKeyDown={fieldKeyDown((e) => {
              if (e.key === "Escape") {
                setQuery("")
                setSearching(false)
              }
            })}
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
      {rowsView(activeView) ? (
        <>
          {menuTrigger(
            "fields",
            <Button ref={carryFocus} variant="ghost" size="sm" className={cn("h-7 gap-1.5 px-2 text-ui-sm", hidden.size ? "text-ink" : "text-ink-2")} onPointerEnter={warmMenus} onFocus={warmMenus} onPointerDown={warmMenus}>
              <EyeOff className="size-3.5" /> <span className="max-sm:hidden">{hidden.size ? `${hidden.size} hidden` : "Fields"}</span>
            </Button>,
            (m, trigger, open) => <m.FieldsMenu trigger={trigger} {...open} fields={sortedFields} hidden={display.hidden} onHidden={(h) => changeDisplay({ hidden: h })} />,
          )}
          {menuTrigger(
            "height",
            <Button ref={carryFocus} variant="ghost" size="icon-sm" aria-label="Row height and colour" aria-haspopup="menu" className="text-ink-2" onPointerEnter={warmMenus} onFocus={warmMenus} onPointerDown={warmMenus}>
              <SlidersHorizontal className="size-3.5" />
            </Button>,
            (m, trigger, open) => (
              <m.RowHeightMenu
                trigger={trigger}
                {...open}
                height={display.rowHeight}
                onHeight={(h) => changeDisplay({ rowHeight: h })}
                list={narrow && activeView === "grid" ? listMode : null}
                onList={() => changeDisplay({ list: !listMode })}
                fields={fields}
                colors={display.colors}
                onColors={(colors) => changeDisplay({ colors })}
              />
            ),
          )}
          <Button size="sm" onClick={() => void addRow()} className="ml-1 gap-1.5" aria-label="New row">
            <Plus className="size-3.5" /> <span className="max-sm:hidden">New row</span>
            <kbd className="kbd max-sm:hidden">R</kbd>
          </Button>
        </>
      ) : null}
      {activeView === "board" ? (
        <BoardPart.View fallback={null} render={(m) => <m.BoardGroupBy fields={fields} groupFieldId={display.boardGroup ?? undefined} onPick={(id) => changeDisplay({ boardGroup: id })} />} />
      ) : null}
      {activeView === "calendar" && fields.some((f) => f.type === "date") ? (
        <CalendarPart.View fallback={null} render={(m) => <m.CalendarMonthNav month={calendarMonth} onMonth={setCalendarMonth} />} />
      ) : null}
    </>
  )

  return (
    <div className="flex min-h-full flex-col" data-table-page="">
      {/* The header row (T03): breadcrumb and save dot, then Share and More. */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 px-4 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-ui-sm">
          <Link
            href={tablesPath()}
            aria-label="Back to tables"
            className="hidden shrink-0 rounded-md px-1.5 py-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink sm:inline-flex"
          >
            Tables
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-ink-4 sm:block" aria-hidden="true" />
          {/* On a phone the name is the hero's alone, under the app's bar. */}
          <span className="truncate px-1 font-medium text-ink max-sm:hidden">{t.name}</span>
          <SaveDotPart.View
            // Its place held, as the saved dot it is when a table opens.
            fallback={
              <span data-save-dot="" className="ml-1 inline-flex h-5 items-center px-1">
                <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-camp-moss" />
              </span>
            }
            render={(m) => <m.SaveDot state={saveState} savedAt={savedAt ?? new Date(t.updated_at)} onRetry={reload} className="ml-1" />}
          />
        </nav>
        {bundle.can_manage ? null : (
          // Rows anyone may write come back from the trash; its columns are a manager's.
          <Button variant="ghost" size="icon-sm" aria-label="Trash" title="Deleted rows" onPointerEnter={() => void TrashPart.prefetch()} onFocus={() => void TrashPart.prefetch()} onClick={() => setTrashOpen(true)}>
            <RotateCcw className="size-4" />
          </Button>
        )}
        {bundle.presence_topic ? <PresencePart.View fallback={null} render={(m) => <m.default tableId={tableId} topic={bundle.presence_topic ?? ""} onGoTo={goTo} />} /> : null}
        {bundle.can_manage && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onPointerEnter={() => void SharePart.prefetch()}
              onFocus={() => void SharePart.prefetch()}
              onClick={() => setSharing(true)}
              className="gap-1.5"
              aria-label="Share"
              title="Share externally"
            >
              <Share2 className="size-3.5" /> <span className="max-sm:hidden">Share</span>
            </Button>
            {menuTrigger(
              "more",
              <Button ref={carryFocus} variant="ghost" size="icon-sm" aria-label="More" aria-haspopup="menu" onPointerEnter={warmMore} onFocus={warmMore} onPointerDown={warmMenus}>
                <MoreHorizontal className="size-4" />
              </Button>,
              (m, trigger, open) => (
                <m.TableMoreMenu
                  trigger={trigger}
                  {...open}
                  onShare={(visibility) => saveTable({ visibility })}
                  onExport={(format) => void exportAs(format)}
                  onTrash={() => setTrashOpen(true)}
                  tableId={tableId}
                  bundle={bundle}
                />
              ),
            )}
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
                  {...ix("field")}
                  className="-mx-1 block w-full truncate rounded-md border-b border-transparent bg-transparent px-1 font-display text-title-1 text-ink"
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
                {...ix("field")}
                className="-mx-1 mt-0.5 block w-full truncate rounded-md bg-transparent px-1 text-ui text-ink-2 placeholder:text-ink-3"
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

        <div className="flex min-w-0 items-center gap-2">
          <ViewsPart.View
            fallback={
              <span className={VIEW_TRIGGER} data-views-stand-in="">
                <ViewFace view={linked ?? bundle.views?.[0] ?? null} layout={activeView} />
              </span>
            }
            render={(m) => (
              <m.TableViews tableId={tableId} views={bundle.views} fields={fields} canManage={!!bundle.can_manage} layout={activeView} rules={rules} display={display} onApply={applyView} />
            )}
          />
          <ViewTabs active={activeView} onPick={showView} hue={hueFor(tableId)} onForms={bundle.can_manage ? openForms : undefined} />
          <span className="contents" data-view-actions />
        </div>

        {/* One frame for every view (TableViewFrame): the toolbar row, then a
            body that scrolls inside the frame, and one place where a view
            says it has nothing to show. No box: the views sit on the sheet. */}
        <div className="flex min-h-0 flex-1 flex-col" data-table-frame="" aria-busy={ruling || undefined}>
          {/* The chart has its own choices in the same toolbar row. */}
          {activeView !== "chart" && <ViewRulesBar
            fields={sortedFields}
            rules={rules}
            onChange={changeRules}
            // A view read in windows is the server's whole: its count, once
            // counted, and no "Load all", since it reads rows as it reaches them.
            shown={failedInBody ? null : windowed ? (held.counted ? held.count : null) : ruling ? null : shownRows.length}
            held={windowed ? held.count : rows.length}
            total={held.stopped || failedInBody ? null : held.total}
            atLeast={windowed && held.countCapped}
            working={windowed && held.workingOut !== null}
            loading={
              windowed
                ? held.failed
                  ? failedInBody
                    ? null
                    : { reading: false, failed: true, onRetry: held.retry }
                  : null
                : held.complete
                  ? null
                  : { reading: held.reading, failed: held.failed, onLoadAll: () => held.all(true), onRetry: held.retry }
            }
            end={toolbarEnd}
            notice={refusedInBody ? null : (refused ?? held.sumsOut)}
            noticeRetry={held.recount ? { busy: held.recounting, onRetry: held.recount } : null}
          />}
          {/* The grid waits for its rules as itself: its header, and its rows as
              on their way, in the element the rows then fill. */}
          {ruling && (activeView !== "grid" || listMode) ? (
            <ViewSkeleton view={activeView === "grid" ? "list" : activeView} />
          ) : (activeView === "grid" || listMode) &&
            (listMode ? (
              <div>
                <ListPart.View
                  fallback={<ViewSkeleton view="list" />}
                  render={(m) => (
                    <m.TableRowList
                      fields={fields}
                      rows={shownRows}
                      count={windowed ? viewCount : undefined}
                      tail={windowed ? held.tail : groupView && keptHeld ? 1 : 0}
                      grouping={groupView}
                      hues={paint?.hues}
                      onOpen={setOpenRow}
                      onNearEnd={held.complete ? undefined : holdMore}
                      scrollTo={listTo}
                      edits={commit.edits}
                      empty={noRows ? <TableViewState kind="no-rows" hue={hueFor(tableId)} /> : noHit}
                    />
                  )}
                />
              </div>
            ) : (
              <DataTableGrid
                tableId={tableId}
                fields={fields}
                rows={shownRows}
                count={ruling ? Math.min(held.rows.length, SKELETON_ROWS) : windowed ? viewCount : undefined}
                tail={windowed ? held.tail : groupView && keptHeld ? 1 : undefined}
                grouping={groupView}
                hues={paint?.hues}
                tints={paint?.tints}
                canManage={bundle.can_manage}
                onChange={reload}
                onCreated={onCreated}
                focusRow={focusAt?.row}
                selectField={focusAt?.field}
                onFocused={focused}
                marked={added && keptNote ? { rowId: added, note: keptNote } : null}
                onRowFocus={leftRow}
                // Waiting for its rules, it draws placeholders, not the rows read: reaching them read the next window on every open.
                onNearEnd={held.complete || ruling ? undefined : holdMore}
                commit={commit}
                rowHeight={display.rowHeight}
                hidden={display.hidden}
                widths={display.widths}
                onWidth={(id, px) => changeDisplay({ widths: { ...display.widths, [id]: px } })}
                summary={ruling ? undefined : display.summary}
                onSummary={(id, fn) => changeDisplay({ summary: { ...display.summary, [id]: fn } })}
                loaded={heldPart}
                // null till the server's sums come ("Sum …"); failed, refused or left out with none kept (V-48): the loaded rows' (DB-22).
                served={windowed && !held.failed && !refused && (held.summaries || !held.leftOut) ? held.summaries : undefined}
                windowed={windowed}
                refusedSums={held.refusedSums}
                sumsOut={held.sumsOut}
                onSort={(id, dir) => changeRules({ ...rules, sort: [{ field: id, dir }, ...rules.sort.filter((s) => s.field !== id)].slice(0, 3) })}
                onFilter={(id) => {
                  const f = fields.find((x) => x.id === id)
                  if (f && filterCount(rules.filters) < MAX_FILTERS) changeRules({ ...rules, filters: [...rules.filters, freshFilter(f)] })
                }}
                onHide={(id) => changeDisplay({ hidden: [...display.hidden, id] })}
                onOpenRow={setOpenRow}
                compact={narrow}
                empty={
                  noRows ? (
                    // In the table's own hue, the one its icon wears.
                    <TableViewState kind="no-rows" hue={hueFor(tableId)} />
                  ) : (
                    noHit
                  )
                }
              />
            ))}
          {ruling ? null : (activeView === "board" || activeView === "calendar") && noMatch ? (
            noHit
          ) : activeView === "board" ? (
            <BoardPart.View
              fallback={<ViewSkeleton view="board" />}
              render={(m) => (
                <m.DataTableBoard
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
              )}
            />
          ) : activeView === "gallery" ? (
            <GalleryPart.View
              fallback={<ViewSkeleton view="gallery" />}
              render={(m) => (
                <m.TableGallery
                  tableId={tableId}
                  fields={fields}
                  hidden={display.hidden}
                  rows={shownRows}
                  count={windowed ? viewCount : undefined}
                  tail={windowed ? held.tail : 0}
                  hues={paint?.hues}
                  edits={commit.edits}
                  onOpen={setOpenRow}
                  onNearEnd={held.complete ? undefined : holdMore}
                  empty={noRows ? <TableViewState kind="no-rows" hue={hueFor(tableId)} /> : noHit}
                />
              )}
            />
          ) : activeView === "timeline" || activeView === "gantt" ? (
            <TimelinePart.View
              fallback={<ViewSkeleton view="list" />}
              render={(m) => (
                <m.TableTimeline
                  tableId={tableId}
                  fields={fields}
                  rows={shownRows}
                  count={windowed ? viewCount : undefined}
                  tail={windowed ? held.tail : 0}
                  hues={paint?.hues}
                  edits={commit.edits}
                  look={display.timeline}
                  onLook={(timeline) => changeDisplay({ timeline })}
                  gantt={activeView === "gantt"}
                  compact={narrow}
                  onOpen={setOpenRow}
                  onNearEnd={held.complete ? undefined : holdMore}
                  onChange={changed}
                  empty={noRows ? <TableViewState kind="no-rows" hue={hueFor(tableId)} /> : noHit}
                />
              )}
            />
          ) : activeView === "calendar" ? (
            <CalendarPart.View
              fallback={<ViewSkeleton view="calendar" />}
              render={(m) => (
                <m.DataTableCalendar
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
              )}
            />
          ) : null}
          {activeView === "chart" && (
            <ChartPart.View fallback={<ViewSkeleton view="chart" />} render={(m) => <m.DataTableChart tableId={tableId} fields={fields} dataVersion={chartDataVersion} />} />
          )}
        </div>
      </div>

      {openRow && (openShown || loneRow) ? (
        <RecordPart.View
          fallback={null}
          render={(m) => (
            <m.RecordPanel
              tableId={tableId}
              tableName={t.name}
              fields={fields}
              rows={openShown || !loneRow ? shownRows : [loneRow]}
              count={windowed && openShown ? held.count : undefined}
              tail={windowed && openShown ? held.tail : undefined}
              alone={!openShown}
              onReach={windowed ? holdMore : undefined}
              rowId={openRow}
              canManage={bundle.can_manage}
              commit={commit}
              onStep={setOpenRow}
              onClose={() => setOpenRow(null)}
              onChange={reload}
              focusThread={openThread}
            />
          )}
        />
      ) : null}

      {trashOpen ? <TrashPart.View fallback={null} render={(m) => <m.TableTrash tableId={tableId} fields={fields} onClose={() => setTrashOpen(false)} onRestored={reload} />} /> : null}

      {forms ? (
        <FormsPart.View fallback={null} render={(m) => <m.TableFormsDialog tableId={tableId} tableName={t.name} open onOpenChange={setForms} />} />
      ) : null}

      {sharing ? (
        <SharePart.View fallback={null} render={(m) => <m.ShareTableDialog tableId={tableId} tableName={t.name} canShare={bundle.can_manage} onClose={() => setSharing(false)} />} />
      ) : null}
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
        <ViewSkeleton view={view} />
      </div>
    </div>
  )
}

/** A view's shape while it loads: the page's, and a view whose chunk is on its way. */
function ViewSkeleton({ view }: { view: ViewChoice | "list" }) {
  return (
    <>
        {view === "list" ? (
          // The phone's list: rows of 60 px, a title and the values under it.
          Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div key={i} className="flex h-[60px] flex-col justify-center gap-2 border-b border-line">
              <Skeleton className={cn("h-2.5", i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-32" : "w-48")} />
              <Skeleton className="h-2 w-28" />
            </div>
          ))
        ) : view === "board" ? (
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
        ) : view === "gallery" ? (
          <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3", TABLE_VIEW_INSET)}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
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
          Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div key={i} className="flex h-10 items-center gap-6 border-b border-line px-3">
              <Skeleton className={cn("h-3 rounded", i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-32" : "w-48")} />
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="hidden h-3 w-24 rounded sm:block" />
            </div>
          ))
        )}
    </>
  )
}
