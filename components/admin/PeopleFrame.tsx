"use client"

import * as React from "react"
import { useId } from "react"
import type { LucideIcon } from "lucide-react"
import { Search } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { sectionActionClass } from "@/components/ui/settingsSection"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotWelcome } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The one frame the five people tabs draw in: Members, Admins, Teams,
 * Invitations and External users.
 *
 * WHY ONE FRAME. Each tab built its own, so switching between them moved
 * everything (measured at 1440, from the top of the tab):
 *   - the search and the one action sat in three places: in the title's row on
 *     Admins, Teams and Invitations, on a row of its own under a seat line on
 *     Members, and in the list's body on External users, which had no action;
 *   - so the first row started 65px down on Admins and Teams, 85px on
 *     Invitations (its description wrapped beside the controls), 133px on
 *     External users and 151px on Members;
 *   - the title was an h2 in the display face on Members and a div in Inter on
 *     the other four, and the action 32px tall on one tab and 36px on three;
 *   - rows were 58, 59, 61 and 81px tall, with or without an avatar, and the
 *     skeletons had 6 rows on one tab and 3 on the rest.
 * Here the header, the toolbar row, the skeleton, and the place an empty or
 * failed list says so are drawn once. A tab hands over what differs: its words,
 * its search, its one action and its rows.
 */

/** One length for every tab's skeleton: a typical first screen. */
export const PEOPLE_SKELETON_ROWS = 6

/**
 * Every people row's box, the skeleton's too: 56px with a 36px leading mark
 * and two lines (20px and 16px), so a list and its placeholder are one shape
 * on every tab. On a phone a row's actions take a line of their own under it.
 */
export const PEOPLE_ROW = "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap"

/** The list around the rows: one bordered list of hairline rows. */
export const PEOPLE_LIST = "divide-y divide-border rounded-lg border border-border"

/** The toolbar row's fixed height: its controls are 44px on a phone, 32px from md up. */
const TOOLBAR = "flex h-11 items-center gap-2 md:h-8"

/**
 * The count beside the title: how many there are, "of" how many while a search
 * narrows them, and a "+" while more are on their way. Nothing until the first
 * answer, rather than a "0+" that looks like a real number. Pure.
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
  return (
    <div className="relative min-w-0 flex-1 sm:w-80 sm:flex-none">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        name={name}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 32px from md up, as written; the field keeps its own 44px on a phone.
        className="h-8 pl-9"
        aria-label={label}
      />
    </div>
  )
}

interface PeopleFrameProps {
  title: string
  /** peopleCount(): beside the title, in the muted ink. */
  count?: string
  /** One line: it has to fit a phone, so every tab's toolbar starts at the same height. */
  description: React.ReactNode
  search: PeopleSearchProps
  /** The tab's one primary action (Button size sm), on the toolbar's right. */
  action?: React.ReactNode
  /** Something the reader must see before the rows (a full plan): between the toolbar and the list. */
  notice?: React.ReactNode
  /** The first page is on its way: the list's own skeleton. */
  loading: boolean
  loadingLabel: string
  /** The skeleton's leading mark: a person's avatar, or a team's or invitation's tile. */
  leading?: "avatar" | "tile"
  /** In place of the rows: the tab's EmptyState or ErrorState, where every tab draws it. */
  state?: React.ReactNode
  /** Under the rows: a "loading the rest" line, the plan's seats. */
  footer?: React.ReactNode
  children?: React.ReactNode
}

export function PeopleFrame({
  title,
  count,
  description,
  search,
  action,
  notice,
  loading,
  loadingLabel,
  leading = "avatar",
  state,
  footer,
  children,
}: PeopleFrameProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} data-people-frame="" className="space-y-3">
      <PeopleHeader id={id} title={title} count={count} description={description} />
      <div data-people-toolbar="" className={TOOLBAR}>
        <PeopleSearch {...search} />
        {action ? <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {notice ? <div data-people-notice="">{notice}</div> : null}
      <TooltipProvider>
        <div data-people-body="">
          {loading ? (
            <PeopleListSkeleton label={loadingLabel} leading={leading} />
          ) : state ? (
            // Anchored where the rows start, not centred in the space below:
            // centred, a state with a button sat higher than one without.
            <div data-people-state="" className="flex justify-center">
              {state}
            </div>
          ) : (
            children
          )}
          {footer}
        </div>
      </TooltipProvider>
    </section>
  )
}

function PeopleHeader({ id, title, count, description }: { id: string; title: string; count?: string; description: React.ReactNode }) {
  // SettingsSection's header, so a people tab's title sits where every other
  // tab's does; the count beside the title rather than inside the heading.
  return (
    <div data-people-header="" className="min-w-0 space-y-1">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {count ? <span className="text-sm tabular-nums text-muted-foreground">{count}</span> : null}
      </div>
      <p className="truncate text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

/**
 * The list while its first page loads: the rows' own box, leading mark and two
 * lines, six of them, so nothing moves when the data lands.
 */
export function PeopleListSkeleton({ label, leading = "avatar" }: { label: string; leading?: "avatar" | "tile" }) {
  return (
    <ul aria-busy="true" aria-label={label} data-people-skeleton="" className={PEOPLE_LIST}>
      {Array.from({ length: PEOPLE_SKELETON_ROWS }).map((_, i) => (
        <li key={i} className={PEOPLE_ROW} aria-hidden="true">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {leading === "avatar" ? (
              <Skeleton variant="circle" className="size-9 shrink-0" />
            ) : (
              <Skeleton className="size-9 shrink-0 rounded-lg" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-5 items-center">
                <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-36" : "w-28")} />
              </div>
              <div className="flex h-4 items-center">
                <Skeleton className={cn("h-3 max-w-full", i % 2 === 0 ? "w-56" : "w-44")} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * A people tab before its code has arrived (the admin page loads each section's
 * code when it is first opened): the frame itself, header, toolbar and list, at
 * the sizes the tab will draw, so the tab drops in without a jump.
 */
export function PeopleTabSkeleton({ leading = "avatar", hasAction = true }: { leading?: "avatar" | "tile"; hasAction?: boolean }) {
  return (
    <div role="status" aria-label="Loading this section" data-people-frame="" className="space-y-3">
      <div data-people-header="" className="space-y-1" aria-hidden="true">
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
      </div>
      <div data-people-toolbar="" className={TOOLBAR} aria-hidden="true">
        <Skeleton className="h-full min-w-0 flex-1 sm:w-80 sm:flex-none" />
        {hasAction ? <Skeleton className="ml-auto h-full w-32 shrink-0" /> : null}
      </div>
      <div aria-hidden="true">
        <PeopleListSkeleton label="Loading" leading={leading} />
      </div>
    </div>
  )
}

type ButtonProps = React.ComponentProps<typeof Button>

/** The leading mark of a row that is not a person: a team, an invitation. 36px, as an avatar is. */
export const PERSON_TILE = "size-9"

/**
 * One row of a people list: a 36px leading mark, a title line and a meta line,
 * and its actions at the end (on a phone, on a line of their own under it,
 * with their words showing, since a phone has no hover for a tooltip).
 *
 * `onOpen` makes the mark and the words one button (a member's profile).
 */
export function PersonRow({
  leading,
  title,
  tags,
  meta,
  actions,
  onOpen,
  openLabel,
  as: Tag = "li",
  className,
}: {
  leading: React.ReactNode
  title: React.ReactNode
  /** Small words after the title: "You", "Deactivated". */
  tags?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  onOpen?: () => void
  openLabel?: string
  as?: "li" | "div"
  className?: string
}) {
  const words = (
    <>
      {leading}
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-5">
          <span className="truncate">{title}</span>
          {tags}
        </span>
        {meta ? <span className="truncate text-xs leading-4 text-muted-foreground">{meta}</span> : null}
      </span>
    </>
  )
  return (
    <Tag data-person-row="" className={cn("group transition-colors hover:bg-highlight", PEOPLE_ROW, className)}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {words}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{words}</div>
      )}
      {actions ? (
        <div data-person-actions="" className="flex w-full items-center justify-end gap-1 sm:w-auto sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </Tag>
  )
}

/** A quiet word after a row's title: "You", "Deactivated", "Deleted". */
export function PersonTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 text-2xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

const ACTION_TONE = {
  default: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink",
  success: "text-success-ink hover:bg-success/10 hover:text-success-ink",
} as const

/**
 * The classes of a row's action: a 32px icon button from sm up, its word kept
 * for a screen reader and shown in a tooltip; on a phone, a 44px button with
 * the icon and the word, since there is no hover there.
 */
export function personActionClass(tone: keyof typeof ACTION_TONE = "default") {
  return cn("h-11 gap-1.5 px-3 text-xs sm:h-8 sm:w-8 sm:gap-0 sm:px-0", ACTION_TONE[tone])
}

/** The word under a row action's icon: shown on a phone, read out everywhere. */
export function PersonActionWord({ children }: { children: React.ReactNode }) {
  return <span className="sm:sr-only">{children}</span>
}

export const PersonAction = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children"> & {
    icon: LucideIcon
    /** The word shown on a phone; it must appear in the accessible name (aria-label). */
    word: string
    /** The tooltip from sm up. */
    tip: React.ReactNode
    tone?: keyof typeof ACTION_TONE
    iconClassName?: string
  }
>(function PersonAction({ icon: Icon, word, tip, tone = "default", iconClassName, className, ...rest }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} type="button" variant="ghost" className={cn(personActionClass(tone), className)} {...rest}>
          <Icon className={cn("size-4", iconClassName)} aria-hidden="true" />
          <PersonActionWord>{word}</PersonActionWord>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
})

/** The tab's one primary action, at the toolbar's end: one height on every tab. */
export function PeopleAction({ icon: Icon, children, ...rest }: Omit<ButtonProps, "size"> & { icon: LucideIcon }) {
  return (
    <Button size="sm" {...rest} className={cn(sectionActionClass, "shrink-0 gap-1.5", rest.className)}>
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </Button>
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
 * The empty states, one rule on all five tabs. A list that has never had
 * anything in it is a first run, so it is welcomed with the welcome spot; a
 * search that matched nobody keeps the section's tile and says what to try,
 * with Clear search. Only Members said more than one line for a search; the
 * others said "No team matches your search." and stopped.
 */
export function PeopleFirstRun({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <EmptyState
      illustration={<SpotWelcome hue={ADMIN_GROUP_HUE.people} />}
      title={title}
      description={description}
      action={action}
    />
  )
}

export function PeopleNoMatch({
  icon,
  title,
  hint,
  onClear,
}: {
  icon: LucideIcon
  /** "No members match “astrid”". */
  title: string
  /** What to try instead. */
  hint: string
  onClear: () => void
}) {
  return (
    <EmptyState
      icon={icon}
      hue={ADMIN_GROUP_HUE.people}
      title={title}
      description={hint}
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear search
        </Button>
      }
    />
  )
}

/** A search query as a title quotes it: “astrid”. */
export const quoted = (q: string) => `\u201c${q.trim()}\u201d`
