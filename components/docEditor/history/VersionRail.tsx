"use client"

/**
 * The versions, newest first, in days (docs programme B8): what each is called
 * (its name, else its time), why it was kept when that is worth saying, who
 * it credits (an agent with the person who asked it) and whether it is
 * pinned. A listbox: ↑ and ↓ move through it, Home and End go to the ends,
 * and choosing a version shows it.
 */

import * as React from "react"
import { History, Pin } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { VersionReason } from "@/components/dialog/resourceListParts"
import { Credits } from "./Credits"
import { attrValue, byDay, creditsOf, reasonOf, refusalWords, versionTime, type DocVersion, type VersionList } from "./versions"

export interface VersionRailProps {
  list: VersionList | undefined
  loading: boolean
  failed: unknown
  onRetry(): void
  selectedId: string | null
  onSelect(id: string): void
  /** The phone's list: a row opens the version. */
  onOpen?(id: string): void
  /** Focus the selected row once the list is there (the sheet opening). */
  autoFocus?: boolean
}

export function VersionRail({ list, loading, failed, onRetry, selectedId, onSelect, onOpen, autoFocus }: VersionRailProps) {
  const versions = React.useMemo(() => list?.versions ?? [], [list])
  const days = React.useMemo(() => byDay(versions), [versions])
  const boxRef = React.useRef<HTMLDivElement>(null)

  const rowOf = (id: string) => boxRef.current?.querySelector<HTMLElement>(`[data-version-id="${attrValue(id)}"]`)
  const focusRow = (id: string) => rowOf(id)?.focus()

  React.useEffect(() => {
    if (!autoFocus || !selectedId) return
    const row = rowOf(selectedId)
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: "nearest" })
    // Once, as the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, versions.length > 0])

  if (failed && !list) {
    return <ErrorState compact subject="this doc's history" onRetry={onRetry} detail={refusalWords(failed)} className="px-4" />
  }
  if (loading && !list) {
    return (
      <div role="status" aria-label="Loading versions" className="space-y-1 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} aria-hidden="true" className="space-y-1.5 rounded-lg px-3 py-2.5">
            <Skeleton className={cn("h-3.5", i % 2 ? "w-1/3" : "w-2/5")} />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    )
  }
  if (!versions.length) {
    return (
      <EmptyState
        icon={History}
        title="No versions yet"
        description="A version is kept every 10 minutes while people edit, and 2 minutes after they stop. Save one yourself any time."
        headingLevel={3}
        className="px-4 py-10"
      />
    )
  }

  const move = (e: React.KeyboardEvent, from: string) => {
    const at = versions.findIndex((v) => v.id === from)
    const to =
      e.key === "ArrowDown" ? Math.min(versions.length - 1, at + 1) : e.key === "ArrowUp" ? Math.max(0, at - 1) : e.key === "Home" ? 0 : e.key === "End" ? versions.length - 1 : -1
    if (e.key === "Enter" && onOpen) {
      e.preventDefault()
      onOpen(from)
      return
    }
    if (to < 0) return
    e.preventDefault()
    onSelect(versions[to].id)
    focusRow(versions[to].id)
  }

  return (
    <div ref={boxRef} role="listbox" aria-label="Versions" className="px-2 pb-2" data-history-rail="">
      {days.map((d) => (
        <div key={d.day} role="group" aria-label={d.day}>
          <div aria-hidden="true" className="sticky top-0 z-[1] bg-pop px-3 pb-1 pt-3 text-meta font-medium text-ink-3">
            {d.day}
          </div>
          {d.versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              people={list?.people ?? null}
              selected={v.id === selectedId}
              tabbable={v.id === selectedId || (!selectedId && v === versions[0])}
              onSelect={() => (onOpen ? onOpen(v.id) : onSelect(v.id))}
              onKeyDown={(e) => move(e, v.id)}
            />
          ))}
        </div>
      ))}
      <p className="px-3 pb-2 pt-4 text-meta text-ink-3">
        Every version is kept for a day, then one an hour for a week, then one a day. Named and pinned versions stay.
      </p>
    </div>
  )
}

function VersionRow({
  version,
  people,
  selected,
  tabbable,
  onSelect,
  onKeyDown,
}: {
  version: DocVersion
  people: VersionList["people"]
  selected: boolean
  tabbable: boolean
  onSelect(): void
  onKeyDown(e: React.KeyboardEvent): void
}) {
  const credits = creditsOf(version, people)
  const reason = reasonOf(version, credits)
  const time = versionTime(version)
  const name = version.name?.trim()
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-version-id={version.id}
      title={time.full}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "group/row relative cursor-pointer rounded-lg px-3 py-2 outline-none transition-colors duration-[140ms]",
        "hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand",
        selected && "bg-raised shadow-sel hover:bg-raised",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("min-w-0 flex-1 truncate text-ui", name ? "font-[590] text-ink" : "font-[510] text-ink tabular-nums")}>{name || time.short}</span>
        {version.pinned && (
          <>
            <Pin aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            <span className="sr-only">, pinned</span>
          </>
        )}
      </div>
      {(name || reason) && (
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-ink-3">
          {name && <span className="tabular-nums">{time.short}</span>}
          {name && reason && <span aria-hidden="true">·</span>}
          {reason && <VersionReason label={reason.label} warning={reason.warning} />}
        </div>
      )}
      {credits.length > 0 && <Credits credits={credits} className="mt-1" />}
    </div>
  )
}
