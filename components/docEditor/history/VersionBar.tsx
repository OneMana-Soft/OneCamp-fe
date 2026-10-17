"use client"

/**
 * Above a version's preview (docs programme B8): what the version is called
 * and who it credits, with Name, Pin, Show changes and Restore; and when
 * changes are on, the bar that says what they are compared with, how many
 * words moved, and steps from one change to the next.
 */

import * as React from "react"
import { ChevronDown, ChevronUp, Loader2, Pencil, Pin, PinOff, RotateCcw } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { isComposingKey } from "@/lib/keys/ime"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Credits } from "./Credits"
import { creditsOf, MAX_NAME, reasonOf, versionWhen, type DocVersion, type VersionList } from "./versions"
import type { DiffStats } from "./diff"

export type CompareWith = "before" | "now"

export interface VersionBarProps {
  version: DocVersion
  people: VersionList["people"]
  /** Saves a name and the pin together; throws with the words to show. */
  onName(name: string, pinned: boolean): Promise<void>
  showChanges: boolean
  onShowChanges(on: boolean): void
  onRestore(): void
  /** The phone's: no labels on Name and Pin, and Show changes and Restore live in its bottom bar. */
  compact?: boolean
}

export function VersionBar({ version, people, onName, showChanges, onShowChanges, onRestore, compact }: VersionBarProps) {
  const credits = creditsOf(version, people)
  const reason = reasonOf(version, credits)
  const name = version.name?.trim() ?? ""
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState<"name" | "pin" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const switchId = React.useId()

  // Another version chosen: whatever was being typed or said was about the last one.
  React.useEffect(() => {
    setEditing(false)
    setError(null)
  }, [version.id])

  const save = async (next: string, pinned: boolean, what: "name" | "pin") => {
    setBusy(what)
    setError(null)
    try {
      await onName(next, pinned)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="shrink-0 border-b border-line px-5 py-3 md:px-8" data-version-bar="">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <NameField
              initial={name}
              busy={busy === "name"}
              onSave={(next) => void save(next, version.pinned, "name")}
              onCancel={() => {
                setEditing(false)
                setError(null)
              }}
            />
          ) : (
            <h3 className="truncate text-heading text-ink" data-version-title="">
              {name || versionWhen(version)}
            </h3>
          )}
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-meta text-ink-3">
            {name && <span className="tabular-nums">{versionWhen(version)}</span>}
            {name && (reason || credits.length > 0) && <span aria-hidden="true">·</span>}
            {reason && <span className={cn(reason.warning && "text-warning-ink")}>{reason.label}</span>}
            {reason && credits.length > 0 && <span aria-hidden="true">·</span>}
            {credits.length > 0 && <Credits credits={credits} className="min-w-0" max={4} />}
          </div>
          {error && (
            <p role="alert" className="mt-1.5 text-meta text-danger-ink">
              {error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!editing && (
            <IconAction label={name ? "Rename this version" : "Name this version"} onClick={() => setEditing(true)} compact={compact} text="Name">
              <Pencil />
            </IconAction>
          )}
          <IconAction
            label={version.pinned ? "Unpin this version" : "Pin this version, so it is always kept"}
            pressed={version.pinned}
            busy={busy === "pin"}
            onClick={() => void save(name, !version.pinned, "pin")}
            compact={compact}
            text={version.pinned ? "Unpin" : "Pin"}
          >
            {version.pinned ? <PinOff /> : <Pin />}
          </IconAction>
          {!compact && (
            <>
              <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-line-2" />
              <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-ui text-ink-2 hover:text-ink">
                <Switch id={switchId} checked={showChanges} onCheckedChange={onShowChanges} data-show-changes="" />
                Show changes
              </label>
              <Button size="sm" className="ml-2 gap-1.5" onClick={onRestore} data-restore-version="">
                <RotateCcw className="!size-3.5" aria-hidden="true" />
                Restore
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function IconAction({
  label,
  onClick,
  pressed,
  busy,
  compact,
  text,
  children,
}: {
  label: string
  onClick(): void
  pressed?: boolean
  busy?: boolean
  compact?: boolean
  text: string
  children: React.ReactNode
}) {
  const button = (
    <Button
      variant="ghost"
      size={compact ? "icon-sm" : "sm"}
      onClick={onClick}
      aria-label={compact ? label : undefined}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      className={cn(!compact && "gap-1.5 px-2")}
    >
      {busy ? <Loader2 className="animate-spin" /> : children}
      {!compact && text}
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** A version's name, typed in place: Enter keeps it, Esc leaves it as it was, an empty name unnames it. */
function NameField({ initial, busy, onSave, onCancel }: { initial: string; busy: boolean; onSave(name: string): void; onCancel(): void }) {
  const [value, setValue] = React.useState(initial)
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value)
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={ref}
        value={value}
        maxLength={MAX_NAME}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // An input method's Escape drops the word being made, not the name.
          if (e.key === "Escape" && !isComposingKey(e.nativeEvent)) {
            // The name, not the sheet.
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
        aria-label="The version's name"
        placeholder="Name this version"
        disabled={busy}
        className="h-7 min-w-0 flex-1 rounded-md bg-sunken px-2 text-heading text-ink outline-none ring-1 ring-inset ring-line focus-visible:ring-2 focus-visible:ring-brand"
        data-version-name-field=""
      />
      <Button type="submit" size="sm" disabled={busy} aria-busy={busy || undefined}>
        {busy && <Loader2 className="animate-spin" />}
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </form>
  )
}

export interface DiffBarProps {
  compareWith: CompareWith
  onCompareWith(c: CompareWith): void
  /** False for the oldest version: nothing came before it. */
  hasBefore: boolean
  /** False where the doc's live copy isn't open here. */
  hasNow: boolean
  busy: boolean
  stats: DiffStats | null
  targets: HTMLElement[]
  /** Nothing to say: the version itself couldn't be read. */
  quiet?: boolean
  /** The version before couldn't be read. */
  baseFailed?: boolean
  onRetryBase?(): void
}

/** How the changes read: "18 words added and 4 removed since the version before". */
export function changeSummary(stats: DiffStats, compareWith: CompareWith): string {
  const { wordsAdded: added, wordsRemoved: removed } = stats
  const blocks = stats.added + stats.removed + stats.changed
  const words = (n: number) => `${n} ${n === 1 ? "word" : "words"}`
  if (compareWith === "now") {
    if (!blocks) return "This version is the doc as it is now"
    if (!added && !removed) return `Restoring changes ${blocks === 1 ? "one block" : `${blocks} blocks`}, not their words`
    if (!removed) return `Restoring brings back ${words(added)}`
    if (!added) return `Restoring takes out ${words(removed)}`
    return `Restoring brings back ${words(added)} and takes out ${removed}`
  }
  if (!blocks) return "Nothing changed since the version before"
  if (!added && !removed) return `${blocks === 1 ? "One block" : `${blocks} blocks`} changed since the version before, not their words`
  if (!removed) return `${words(added)} added since the version before`
  if (!added) return `${words(removed)} removed since the version before`
  return `${words(added)} added and ${removed} removed since the version before`
}

export function DiffBar({ compareWith, onCompareWith, hasBefore, hasNow, busy, stats, targets, quiet, baseFailed, onRetryBase }: DiffBarProps) {
  const [at, setAt] = React.useState(-1)
  React.useEffect(() => setAt(-1), [targets])

  const go = (to: number) => {
    const t = targets[to]
    if (!t) return
    for (const el of targets) el.removeAttribute("data-history-current")
    t.setAttribute("data-history-current", "")
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    t.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
    setAt(to)
  }

  const options = [
    { value: "before" as const, label: "Version before", disabled: !hasBefore, title: hasBefore ? undefined : "This is the oldest version kept" },
    { value: "now" as const, label: "Doc now", disabled: !hasNow },
  ]
  const nothingBefore = compareWith === "before" && !hasBefore
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-sunken/60 px-5 py-2 md:px-8" data-diff-bar="">
      <span className="text-meta text-ink-3 max-sm:sr-only">Compared with</span>
      <SegmentedControl value={compareWith} onValueChange={onCompareWith} options={options} aria-label="Compare this version with" />
      {/* On a phone the summary has a line of its own, under the choice. */}
      <span role="status" aria-live="polite" className="order-last min-w-0 basis-full text-meta text-ink-2 sm:order-none sm:basis-0 sm:flex-1 sm:truncate" data-diff-summary="">
        {quiet ? null : nothingBefore ? (
          "This is the oldest version kept, so nothing comes before it"
        ) : baseFailed ? (
          <span className="inline-flex items-center gap-1.5">
            Couldn&apos;t read the version before. Nothing has been lost.
            <Button variant="ghost" size="xs" onClick={onRetryBase}>
              Try again
            </Button>
          </span>
        ) : busy || !stats ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Comparing…
          </span>
        ) : (
          changeSummary(stats, compareWith)
        )}
      </span>
      {!quiet && !baseFailed && !busy && stats && targets.length > 0 && (
        <span className="ml-auto flex items-center gap-1 sm:ml-0" data-change-stepper="" data-touch-group="24">
          <span className="text-meta tabular-nums text-ink-3">{at < 0 ? `${targets.length} ${targets.length === 1 ? "change" : "changes"}` : `${at + 1} of ${targets.length}`}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Previous change" disabled={at <= 0} onClick={() => go(at - 1)}>
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Next change" disabled={at >= targets.length - 1} onClick={() => go(at + 1)}>
            <ChevronDown />
          </Button>
        </span>
      )}
    </div>
  )
}
