"use client"

import * as React from "react"
import { useEffect, useId, useRef } from "react"
import type { LucideIcon } from "lucide-react"
import { MoreHorizontal, Search, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotSearch, SpotWelcome } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The one frame the five people tabs draw in: Members, Admins, Teams,
 * Invitations and External users (design v3, admin A2, mock M3).
 *
 * WHY ONE FRAME. Each tab built its own, so switching between them moved
 * everything: the search and the action sat in three places, the first row
 * started 65 to 151px down, rows were 58 to 81px tall. Here the toolbar, the
 * list's header row, the skeleton and the place an empty or failed list says
 * so are drawn once. A tab hands over what differs: its search, its filter,
 * its one action, its columns and its rows.
 *
 * NO TITLE OF ITS OWN. The page frame draws the section's tile, name and line
 * (the one-title rule), so the frame opens straight on its toolbar.
 *
 * THE LIST (design v3): no outer box. A 32px header row on --sunken names the
 * columns; rows are 52px (60px two-line rows on a phone) with a 32px avatar,
 * the name at 14/510 over a 12.5 ink-2 line, the tab's columns, and every
 * action in one ⋯ menu at the end. The menu shows on hover from a pointer
 * and always on a touch screen. Grid columns come from `cols`, so the header
 * and every row line up.
 */

/** One length for every tab's skeleton: a typical first screen. */
export const PEOPLE_SKELETON_ROWS = 8

/**
 * The count of the list: how many there are, "of" how many while a search
 * narrows them, and a "+" while more are on their way. Nothing until the first
 * answer. Pure.
 */
export function peopleCount({
  shown,
  total,
  more = false,
  filtering = false,
  loaded = true,
}: {
  shown: number
  total: number
  more?: boolean
  filtering?: boolean
  loaded?: boolean
}): string {
  if (!loaded) return ""
  const all = `${total}${more ? "+" : ""}`
  return filtering && shown !== total ? `${shown} of ${all}` : all
}

/** Whether a key press came from somewhere that types: a field, an editor. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t || typeof t.closest !== "function") return false
  return !!t.closest("input,textarea,select,[contenteditable='true'],[role='textbox'],[role='dialog'],[role='menu']")
}

/**
 * A single-key shortcut while the frame is on screen ("/" for the search, "I"
 * for Invite), never while typing, in a dialog or with a modifier held.
 */
function useKey(key: string | undefined, run: () => void) {
  const ref = useRef(run)
  useEffect(() => {
    ref.current = run
  })
  useEffect(() => {
    if (!key) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e)) return
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      e.preventDefault()
      ref.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [key])
}

export interface PeopleSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** The field's name for a screen reader: "Search members". */
  label: string
  name?: string
  inputRef?: React.Ref<HTMLInputElement>
}

function PeopleSearch({ value, onChange, placeholder, label, name, inputRef }: PeopleSearchProps) {
  const own = useRef<HTMLInputElement | null>(null)
  useKey("/", () => own.current?.focus())
  const setRefs = (el: HTMLInputElement | null) => {
    own.current = el
    if (typeof inputRef === "function") inputRef(el)
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
  }
  return (
    <div data-people-search="" className="relative min-w-0 flex-1 max-md:basis-full md:w-[280px] md:flex-none">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
      <Input
        ref={setRefs}
        type="search"
        name={name}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 32px from md up, as written; the field keeps its own 44px on a phone.
        className="h-8 pl-8 pr-8"
        aria-label={label}
        aria-keyshortcuts="/"
      />
      {!value && (
        <kbd aria-hidden="true" className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 max-md:hidden">
          /
        </kbd>
      )}
    </div>
  )
}

interface PeopleFrameProps {
  /** The section's name, for the frame's landmark: "Members". */
  label: string
  /** peopleCount(): shown in the Name column's header. */
  count?: string
  search: PeopleSearchProps
  /** A segmented filter beside the search ("All · Active · Deactivated"). */
  filter?: React.ReactNode
  /** The seat meter, on the toolbar's right (under the search on a phone). */
  meter?: React.ReactNode
  /** The tab's one primary action (PeopleAction), at the toolbar's end. */
  action?: React.ReactNode
  /** A quiet second action before the primary. */
  secondary?: React.ReactNode
  /** Something the reader must see before the rows (a full plan, a note). */
  notice?: React.ReactNode
  /** The header labels after Name, one per column of `cols`. */
  columns?: string[]
  /** The grid widths of those columns ("120px 110px 96px"), between Name and the ⋯. */
  cols?: string
  /** The first page is on its way: the list's own skeleton. */
  loading: boolean
  loadingLabel: string
  /** The skeleton's leading mark: a person's avatar, or a team's or invitation's mark. */
  leading?: "avatar" | "tile"
  /** In place of the rows: the tab's empty or failed state. */
  state?: React.ReactNode
  /** Under the rows: a "loading the rest" line. */
  footer?: React.ReactNode
  /** The phone's floating action (PeopleFab). */
  fab?: React.ReactNode
  children?: React.ReactNode
}

/** The list's column template, shared by its header, rows and skeleton. */
function gridStyle(cols?: string): React.CSSProperties {
  return {
    ["--people-cols" as string]: `minmax(0,1fr)${cols ? ` ${cols}` : ""} 28px`,
  }
}

const PeopleGrid = React.createContext<{ columns?: number }>({})

export function PeopleFrame({
  label,
  count,
  search,
  filter,
  meter,
  action,
  secondary,
  notice,
  columns = [],
  cols,
  loading,
  loadingLabel,
  leading = "avatar",
  state,
  footer,
  fab,
  children,
}: PeopleFrameProps) {
  const id = useId()
  return (
    <TooltipProvider>
      <section aria-label={label} data-people-frame="" className={cn("space-y-3", fab && "people-frame-has-fab")}>
        <div data-people-toolbar="" className="people-toolbar">
          <PeopleSearch {...search} />
          {filter ? (
            <div data-people-filter="" className="shrink-0">
              {filter}
            </div>
          ) : null}
          {meter || action || secondary ? (
            <div className="people-toolbar-end">
              {meter ? (
                <div data-people-meter-slot="" className="people-meter-slot">
                  {meter}
                </div>
              ) : null}
              {secondary}
              {action ? (
                <div data-people-action="" className="people-action-slot">
                  {action}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {notice ? <div data-people-notice="">{notice}</div> : null}
        <PeopleGrid.Provider value={{ columns: columns.length }}>
          <div data-people-body="" className="people-list" style={gridStyle(cols)}>
            {loading ? (
              <>
                <PeopleHead columns={columns} count={count} countId={id} />
                <PeopleListSkeleton label={loadingLabel} leading={leading} columns={columns.length} />
              </>
            ) : state ? (
              // Anchored where the rows start, not centred in the space below.
              <div data-people-state="" className="flex justify-center">
                {state}
              </div>
            ) : (
              <>
                <PeopleHead columns={columns} count={count} countId={id} />
                {children}
              </>
            )}
            {footer}
          </div>
        </PeopleGrid.Provider>
        {fab ? (
          <div data-people-fab-slot="" className="md:hidden">
            {fab}
          </div>
        ) : null}
      </section>
    </TooltipProvider>
  )
}

/** The 32px header row on --sunken: Name, the tab's columns, room for the ⋯. */
function PeopleHead({ columns, count, countId }: { columns: string[]; count?: string; countId: string }) {
  return (
    <div data-people-head="" className="people-head" aria-hidden="true">
      <span className="flex items-center gap-1.5">
        Name
        {count ? (
          <span id={countId} className="font-book tabular-nums text-ink-3">
            {count}
          </span>
        ) : null}
      </span>
      {columns.map((c, i) => (
        <span key={`${c}-${i}`} className="people-cell">
          {c}
        </span>
      ))}
      <span />
    </div>
  )
}

/**
 * The list while its first page loads: the rows' own grid, mark and two
 * lines, and a bar per column, eight of them, so nothing moves when the data
 * lands.
 */
export function PeopleListSkeleton({
  label,
  leading = "avatar",
  columns = 0,
}: {
  label: string
  leading?: "avatar" | "tile"
  columns?: number
}) {
  return (
    <ul aria-busy="true" aria-label={label} data-people-skeleton="" className="people-rows">
      {Array.from({ length: PEOPLE_SKELETON_ROWS }).map((_, i) => (
        <li key={i} className="people-row" aria-hidden="true">
          <div className="flex min-w-0 items-center gap-3">
            {leading === "avatar" ? (
              <Skeleton variant="circle" className="people-avatar size-8 shrink-0" />
            ) : (
              <Skeleton className="people-avatar size-8 shrink-0 rounded-lg" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-5 items-center">
                <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-36" : "w-28")} />
              </div>
              <div className="flex h-4 items-center">
                <Skeleton className={cn("h-3 max-w-full", i % 2 === 0 ? "w-48" : "w-40")} />
              </div>
            </div>
          </div>
          {Array.from({ length: columns }).map((__, c) => (
            <div key={c} className="people-cell">
              <Skeleton className={cn("h-3", c % 2 === 0 ? "w-14" : "w-10")} />
            </div>
          ))}
          <span />
        </li>
      ))}
    </ul>
  )
}

/**
 * A people tab before its code has arrived (the admin page loads each
 * section's code when it is first opened): the toolbar and the list, at the
 * sizes the tab will draw, so it drops in without a jump.
 */
export function PeopleTabSkeleton({ leading = "avatar", hasAction = true }: { leading?: "avatar" | "tile"; hasAction?: boolean }) {
  return (
    <div role="status" aria-label="Loading this section" data-people-frame="" className="space-y-3">
      <div data-people-toolbar="" className="people-toolbar" aria-hidden="true">
        <Skeleton className="h-8 min-w-0 flex-1 md:w-[280px] md:flex-none" />
        {hasAction ? <Skeleton className="ml-auto h-7 w-32 shrink-0 max-md:hidden" /> : null}
      </div>
      <div aria-hidden="true" className="people-list" style={gridStyle()}>
        <div className="people-head" />
        <PeopleListSkeleton label="Loading" leading={leading} />
      </div>
    </div>
  )
}

/** The list of rows: hairlines between them, and no box around them. */
export function PeopleRows({ children, label, className }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <ul data-people-rows="" aria-label={label} className={cn("people-rows", className)}>
      {children}
    </ul>
  )
}

/**
 * One row of a people list: a 32px leading mark, the name over a meta line,
 * the tab's columns (`cells`, one per header column, hidden on a phone where
 * the row is two lines), and the ⋯ menu at the end, the only place a row's
 * actions live.
 *
 * `onOpen` makes the mark and the words one button (a member's profile).
 * `dimmed` is a deactivated or deleted row: the name in ink-3 and the avatar
 * desaturated.
 */
export function PersonRow({
  leading,
  title,
  tags,
  meta,
  cells,
  menu,
  onOpen,
  openLabel,
  dimmed,
  as: Tag = "li",
  className,
  marker,
}: {
  leading: React.ReactNode
  title: React.ReactNode
  /** Small words after the title: "You", "Deactivated". */
  tags?: React.ReactNode
  meta?: React.ReactNode
  cells?: React.ReactNode[]
  /** The row's RowMenu. */
  menu?: React.ReactNode
  onOpen?: () => void
  openLabel?: string
  dimmed?: boolean
  as?: "li" | "div"
  className?: string
  /** A data-row value tests and CSS can find this row by ("invite", "joined"). */
  marker?: string
}) {
  const { columns } = React.useContext(PeopleGrid)
  const words = (
    <>
      <span data-person-mark="" className="people-avatar-slot">
        {leading}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span data-person-name="" className="truncate text-sm font-medium leading-5">
            {title}
          </span>
          {tags}
        </span>
        {meta ? <span className="people-meta truncate leading-4 text-ink-2">{meta}</span> : null}
      </span>
    </>
  )
  // Every row draws one cell per header column, so the ⋯ always lands in the last one.
  // Outside a frame (a list drawn on its own), every given cell is drawn.
  const filled = columns === undefined ? (cells ?? []) : Array.from({ length: columns }, (_, i) => cells?.[i] ?? null)
  return (
    <Tag data-person-row="" data-row={marker} data-dimmed={dimmed ? "true" : undefined} className={cn("people-row group", className)}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {words}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-3">{words}</div>
      )}
      {filled.map((c, i) => (
        <div key={i} data-person-cell="" className="people-cell min-w-0">
          {c}
        </div>
      ))}
      <div data-person-actions="" className="flex items-center justify-end">
        {menu}
      </div>
    </Tag>
  )
}

/** A quiet word after a row's title: "You", "Deactivated" (18px, neutral); "Guest" in sun. */
export function PersonTag({ children, tone }: { children: React.ReactNode; tone?: "guest" }) {
  return (
    <span data-person-tag={tone ?? ""} className={cn("people-tag", tone === "guest" && "people-tag-guest")}>
      {children}
    </span>
  )
}

/**
 * The row's one way to its actions: a 28px ⋯ (44px on a phone) whose menu
 * holds them, the destructive one last in danger ink. Shown on hover from a
 * pointer, and always on a touch screen (people.css).
 */
export function RowMenu({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button type="button" variant="ghost" size="icon-sm" data-row-menu="" className="people-menu" aria-label={label}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type ButtonProps = React.ComponentProps<typeof Button>

/**
 * The tab's one primary action, at the toolbar's end: primary sm with its key
 * hint ("Invite people I"), and the key works while the tab is open.
 */
export function PeopleAction({ icon: Icon, children, kbd, ...rest }: Omit<ButtonProps, "size"> & { icon: LucideIcon; kbd?: string }) {
  useKey(kbd, () => {
    if (!rest.disabled) rest.onClick?.({} as React.MouseEvent<HTMLButtonElement>)
  })
  return (
    <Button size="sm" {...rest} aria-keyshortcuts={kbd} className={cn("h-11 shrink-0 md:h-7", rest.className)}>
      <Icon aria-hidden="true" />
      {children}
      {kbd ? (
        <kbd aria-hidden="true" className="kbd max-md:hidden">
          {kbd.toUpperCase()}
        </kbd>
      ) : null}
    </Button>
  )
}

/** The phone's floating action: a 48px primary circle, bottom right, 16px above the bottom bar. */
export function PeopleFab({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick} aria-label={label} data-people-fab="" className="people-fab">
      <Icon aria-hidden="true" />
    </Button>
  )
}

/** What the seat meter says. Pure. */
export function seatWords(used: number, limit: number): { words: string; near: boolean; ratio: number } {
  const ratio = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0
  const left = Math.max(0, limit - used)
  const near = ratio >= 0.9
  const words = near ? (left === 0 ? "No places left" : `${left} ${left === 1 ? "place" : "places"} left`) : `${used} of ${limit}`
  return { words, near, ratio }
}

/**
 * The plan's seats: "14 of 25" over a 120x4 track. At 90 % or more the fill
 * turns sun and the words say how many places are left. The fill moves by
 * scaleX, never by width. Only drawn when the server reports a limit (the
 * free plan); a paid licence reports none and shows nothing.
 */
export function SeatMeter({ used, limit, upgradeUrl }: { used: number; limit: number; upgradeUrl?: string }) {
  if (!limit || limit <= 0) return null
  const { words, near, ratio } = seatWords(used, limit)
  const label = `${used} of ${limit} seats used. Free plan, seats lift on purchase`
  const body = (
    <span data-seat-meter="" data-near={near ? "true" : undefined} className="people-meter">
      <span className="people-meter-words">
        <span className="font-medium tabular-nums text-foreground">{words}</span>
        {!near && <span className="text-ink-3"> seats</span>}
      </span>
      <span className="people-meter-track" aria-hidden="true">
        <span className="people-meter-fill" style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </span>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {upgradeUrl ? (
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"
          >
            {body}
          </a>
        ) : (
          <span tabIndex={0} role="img" aria-label={label} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            {body}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>Free plan · seats lift on purchase</TooltipContent>
    </Tooltip>
  )
}

/** "Loading more…" under a list that pages as it is scrolled. Words, not a spinner. */
export function PeopleMoreLine({ sentinelRef, loading }: { sentinelRef: React.Ref<HTMLDivElement>; loading: boolean }) {
  return (
    <div ref={sentinelRef} className="flex h-10 items-center justify-center" aria-hidden={!loading}>
      {loading ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading more…
        </p>
      ) : null}
    </div>
  )
}

/**
 * A list that has never had anything in it: a first run, welcomed with a
 * 96px spot and the one thing to do about it (§1.7).
 */
export function PeopleFirstRun({
  title,
  description,
  action,
  illustration,
}: {
  title: string
  description: string
  action?: React.ReactNode
  /** The section's spot; the welcome spot when none is given. */
  illustration?: React.ReactNode
}) {
  return (
    <EmptyState
      tone="accent"
      illustration={illustration ?? <SpotWelcome hue={ADMIN_GROUP_HUE.people} />}
      title={title}
      description={description}
      action={action}
    />
  )
}

/** A search that matched nobody: the 64px magnifier spot, what to try, and Clear search (a ghost). */
export function PeopleNoMatch({ title, hint, onClear }: { title: string; hint: string; onClear: () => void }) {
  return (
    <EmptyState
      illustration={<SpotSearch hue={ADMIN_GROUP_HUE.people} />}
      title={title}
      description={hint}
      action={
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden="true" />
          Clear search
        </Button>
      }
    />
  )
}

/** A search query as a title quotes it: “astrid”. */
export const quoted = (q: string) => `“${q.trim()}”`

/** A word with a 6px dot before it ("On", "Off", "Expires in 5 d"): a state, never a pill. */
export function DotWord({ tone = "neutral", children }: { tone?: "ok" | "neutral" | "sun" | "danger"; children: React.ReactNode }) {
  return (
    <span data-dot-word={tone} className="people-dotword">
      <span aria-hidden="true" className="people-dot" />
      {children}
    </span>
  )
}

/** "2 h", "3 d", "just now": how long ago, the way a list column says it. Pure. */
export function relativeShort(iso: string | undefined, now = Date.now()): string {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t <= 0 || new Date(iso).getUTCFullYear() < 1971) return ""
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} d`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo} mo`
  return `${Math.round(d / 365)} y`
}
