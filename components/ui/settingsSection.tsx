"use client"

// The parts a settings page is made of (design v3, admin §1.3), so every one
// reads the same way: a section is a heading, at most one line under it, and
// a CARD of rows; a row is a label, its help, and its control on the right.
//
// The card is the raised surface at e1, r12, with no border: rows sit between
// hairlines inset 16px from the left, so they read as a list inside a card
// (DESIGN_V3 §3.8, elevation as a material). The 1px grey box it replaced was
// the wireframe look.
//
// Two ways to save, chosen per card, never mixed on a card:
// - instant (switches, selects, segmented controls): the row saves on change
//   and says "Saved" with a tick beside its label (saveStatus.tsx);
// - batched (text fields): the card's footer holds what saving does and Save,
//   always drawn so the card never changes height while you type.
// The floating SaveBar dock stays only for forms that span several cards.

import * as React from "react"
import { useEffect, useId, useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertCircle, Loader2, Lock, RefreshCw } from "@/lib/icons"
import { clearUnsaved, markUnsaved } from "@/lib/unsavedChanges"
import { SavedTick, type SaveStatus } from "@/components/ui/saveStatus"

/** The gap between sections on a page: 32px (the old ADMIN_SECTION_STACK). */
export const SETTINGS_STACK = "space-y-8"

/**
 * A section: its title (15/20 590), at most one line under it (13/18 ink-2),
 * and its card 12px below.
 *
 * `action` is the section's one primary action (or a couple of quiet ones),
 * on the title's row at its end; under sm it goes under the words, so a long
 * description never squeezes beside it. `level` 3 is a section inside a
 * section: a 14px title. `tone="danger"` is the Danger zone's heading.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
  action,
  level = 2,
  id: sectionId,
  tone,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
  level?: 2 | 3
  /** An id for the section itself, for a jump link or a search hit. */
  id?: string
  tone?: "danger"
}) {
  const id = useId()
  const Heading = level === 3 ? "h3" : "h2"
  const heading = (
    <div className="min-w-0">
      <Heading
        id={id}
        // Joined by hand, not cn(): tailwind-merge reads text-heading as a
        // colour and would drop it beside text-foreground.
        className={`${level === 3 ? "text-sm font-medium" : "text-heading"} ${tone === "danger" ? "text-danger-ink" : "text-foreground"}`}
      >
        {title}
      </Heading>
      {description && <p className="mt-1 max-w-[60ch] text-xs text-muted-foreground text-pretty">{description}</p>}
    </div>
  )
  return (
    <section id={sectionId} aria-labelledby={id} data-settings-section="" className={cn("scroll-mt-5 space-y-3", className)}>
      {action ? (
        <div data-section-header="" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          {heading}
          <div data-section-action="" className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
          </div>
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}

/**
 * The one primary action of a section's header, and its quiet neighbours: 32px
 * from md up and 44px on a phone, where it is a touch target.
 */
export const sectionActionClass = "h-11 md:h-8"

/**
 * The settings card: rows between inset hairlines on the raised surface at
 * e1, r12, no border. `footer` is a batched card's footer (SettingsCardFooter);
 * `dirty` rings it in the accent while it has unsaved edits; `danger` is the
 * Danger zone's ring (danger at 28 %, no red fill).
 */
export function SettingsList({
  children,
  className,
  footer,
  dirty,
  danger,
  id,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode
  className?: string
  footer?: React.ReactNode
  dirty?: boolean
  danger?: boolean
  id?: string
  "aria-label"?: string
}) {
  return (
    <div
      id={id}
      aria-label={ariaLabel}
      data-settings-card=""
      data-dirty={dirty ? "true" : undefined}
      data-danger={danger ? "true" : undefined}
      className={cn("set-card", className)}
    >
      {children}
      {footer}
    </div>
  )
}

/** The settings card, by the name the spec gives it. */
export const SettingsCard = SettingsList

/**
 * A batched card's footer (Vercel's pattern): what happens when it is saved on
 * the left, Save (and Reset while dirty) on the right. Save is disabled until
 * there is something to save; the footer is there either way.
 */
export function SettingsCardFooter({
  hint,
  dirty,
  saving,
  onSave,
  onReset,
  saveLabel = "Save",
  saveDisabled,
  children,
}: {
  hint?: React.ReactNode
  dirty: boolean
  saving?: boolean
  onSave: () => void
  onReset?: () => void
  saveLabel?: string
  /** Extra reason Save can't be pressed (an invalid field). */
  saveDisabled?: boolean
  /** Anything beside the buttons (a status word). */
  children?: React.ReactNode
}) {
  return (
    <div data-card-footer="" className="set-foot">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground text-pretty">{hint}</p>
      {children}
      {dirty && onReset && (
        <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={saving}>
          Reset
        </Button>
      )}
      <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving || saveDisabled} aria-busy={saving || undefined}>
        {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
        {saving ? "Saving…" : saveLabel}
      </Button>
    </div>
  )
}

/** A lock beside a label whose control is out of reach, with the reason on hover. */
function LockedGlyph({ reason }: { reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={reason} className="inline-flex rounded-sm text-ink-3 focus-visible:outline-2 focus-visible:outline-ring">
          <Lock className="size-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

/** The words of a row: label (with its lock and saved tick) and help. */
function RowWords({
  htmlFor,
  label,
  description,
  status,
  locked,
  disabled,
  descId,
}: {
  htmlFor: string
  label: React.ReactNode
  description?: React.ReactNode
  status?: SaveStatus
  locked?: string
  disabled?: boolean
  descId: string
}) {
  const failed = status?.state === "error"
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        {locked && <LockedGlyph reason={locked} />}
        <Label htmlFor={htmlFor} className={cn("text-sm font-medium leading-5", (disabled || locked) && "text-ink-3")}>
          {label}
        </Label>
        {failed && <span aria-hidden="true" data-save-failed="" className="size-1.5 shrink-0 rounded-full bg-destructive" />}
        <SavedTick status={status} />
      </div>
      {failed && status?.error ? (
        <p id={descId} className="mt-0.5 text-xs text-danger-ink text-pretty">
          {status.error}
        </p>
      ) : (
        description && (
          <p id={descId} className="mt-0.5 line-clamp-2 text-xs text-muted-foreground text-pretty">
            {description}
          </p>
        )
      )}
    </div>
  )
}

/**
 * Replays the row's shake on each new failure. Exported for rows built
 * outside SettingRow (a workflow's switch): spread `data-shake` and
 * `onAnimationEnd` on an element with the `set-row` class.
 */
export function useShake(status?: SaveStatus) {
  const [shake, setShake] = useState(false)
  const failures = status?.failures ?? 0
  useEffect(() => {
    if (!failures) return
    setShake(false)
    const raf = requestAnimationFrame(() => setShake(true))
    return () => cancelAnimationFrame(raf)
  }, [failures])
  return { shake, onAnimationEnd: () => setShake(false) }
}

/**
 * A switch with its label and help. The whole row is the target: clicking its
 * words or its empty space toggles it. `status` shows the saved tick or the
 * failure; `locked` names why it can't be changed (plan or permission).
 */
export function SwitchRow(props: {
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  status?: SaveStatus
  locked?: string
  className?: string
  id?: string
}) {
  const generated = useId()
  const id = props.id ?? generated
  const off = props.disabled || !!props.locked
  const { shake, onAnimationEnd } = useShake(props.status)
  return (
    <div
      data-setting-row="switch"
      data-target="true"
      data-disabled={off ? "true" : undefined}
      data-shake={shake ? "true" : undefined}
      onAnimationEnd={onAnimationEnd}
      onClick={(e) => {
        if (off) return
        // The switch and the label toggle on their own.
        const t = e.target as HTMLElement
        if (t.closest("button,label,a,input")) return
        props.onChange(!props.checked)
      }}
      className={cn("set-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6", props.className)}
    >
      <RowWords
        htmlFor={id}
        label={props.label}
        description={props.description}
        status={props.status}
        locked={props.locked}
        disabled={props.disabled}
        descId={`${id}-desc`}
      />
      <Switch
        id={id}
        className={cn("shrink-0", off && "opacity-50")}
        aria-describedby={props.description || props.status?.error ? `${id}-desc` : undefined}
        checked={props.checked}
        disabled={off}
        onCheckedChange={props.onChange}
        aria-busy={props.status?.state === "saving" || undefined}
      />
    </div>
  )
}

/**
 * Any other setting's row: its name and help on the left, its control (a
 * select, an input, a button) on the right, vertically centred.
 *
 * The row never rewrites its child. It ties the label to the control by
 * `controlId` (the control carries that id), and gives the help the id
 * `${controlId}-desc` for the control to name in aria-describedby.
 *
 * Side by side only when the ROW is at least 520px wide (a container query),
 * not the window: narrower, the control goes under the words, as on a phone.
 * `control="field"` puts an input or select in the 240px control column, so
 * one card's fields line up. `layout="stacked"` always puts the control under
 * the words at full width: a textarea, a list, a key to paste.
 */
export function SettingRow({
  label,
  description,
  controlId,
  children,
  className,
  layout = "inline",
  control = "auto",
  status,
  locked,
  disabled,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  /** The id the control carries, so clicking the label focuses it. */
  controlId: string
  children: React.ReactNode
  className?: string
  layout?: "inline" | "stacked"
  control?: "auto" | "field"
  status?: SaveStatus
  locked?: string
  disabled?: boolean
}) {
  const { shake, onAnimationEnd } = useShake(status)
  const words = (
    <RowWords
      htmlFor={controlId}
      label={label}
      description={description}
      status={status}
      locked={locked}
      disabled={disabled}
      descId={`${controlId}-desc`}
    />
  )
  const shared = {
    "data-disabled": disabled || locked ? "true" : undefined,
    "data-shake": shake ? "true" : undefined,
    onAnimationEnd,
  }
  if (layout === "stacked") {
    return (
      <div data-setting-row="stacked" {...shared} className={cn("set-row space-y-2", className)}>
        {words}
        <div className={cn("min-w-0", (disabled || locked) && "opacity-50")}>{children}</div>
      </div>
    )
  }
  return (
    <div data-setting-row="" {...shared} className={cn("set-row @container", className)}>
      <div className="grid gap-2 @min-[520px]:grid-cols-[minmax(0,1fr)_auto] @min-[520px]:items-center @min-[520px]:gap-6">
        {words}
        <div
          data-control={control}
          className={cn(
            "flex shrink-0 items-center gap-2 @min-[520px]:justify-end",
            control === "field" && "w-full @min-[520px]:w-60 [&>*]:min-w-0 [&>*]:flex-1",
            (disabled || locked) && "opacity-50",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * A card whose read failed: its body becomes one compact row with the danger
 * glyph, what couldn't be loaded, the server's reason, and Try again.
 */
export function SettingsCardError({
  what,
  reason,
  onRetry,
  retrying,
}: {
  /** "workspace settings" reads "Couldn't load workspace settings." */
  what: string
  reason?: React.ReactNode
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div role="alert" data-card-error="" className="set-row flex items-center gap-3">
      <AlertCircle className="size-4 shrink-0 text-danger-ink" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load {what}.</p>
        <p className="text-xs text-muted-foreground text-pretty">
          {reason ?? "Nothing has been lost. This is usually a connection problem."}
        </p>
      </div>
      {onRetry && (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn("size-3.5", retrying && "animate-spin")} aria-hidden="true" />
          {retrying ? "Trying…" : "Try again"}
        </Button>
      )}
    </div>
  )
}

/**
 * Rows held in their shape while a card loads: a label bar, a help bar and the
 * control's shape on the right, at the row's real height, so nothing moves
 * when the data arrives.
 */
export function SettingsRowsSkeleton({ rows = 3, control = "switch" }: { rows?: number; control?: "switch" | "field" | "button" }) {
  return (
    <div role="status" aria-label="Loading" className="contents">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} aria-hidden="true" className="set-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-[120px]" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className={control === "switch" ? "h-4 w-7 rounded-full" : control === "field" ? "h-8 w-60" : "h-7 w-20"} />
        </div>
      ))}
    </div>
  )
}

/**
 * The Danger zone: always the last section on its page. A heading in danger
 * ink, a card with a danger ring and no red fill, rows whose buttons are the
 * danger variant.
 */
export function DangerZone({ children, description, id }: { children: React.ReactNode; description?: React.ReactNode; id?: string }) {
  return (
    <SettingsSection title="Danger zone" tone="danger" description={description} id={id}>
      <SettingsList danger>{children}</SettingsList>
    </SettingsSection>
  )
}

/** The event a way off the page sends first, so the dock nudges before a confirm. */
export const SAVE_NUDGE_EVENT = "onecamp:save-nudge"

/**
 * Unsaved changes on a form that spans several cards (the email template
 * editor, a provider's editor): a dock floating at the bottom of the sheet,
 * on --pop at e3, r12, 48px, at most 560px wide, with an unsaved dot, the
 * words, Discard and Save. Also asks before the tab is closed or reloaded with
 * them unsaved. A way off the page nudges it once (x ±6px) before it asks.
 *
 * On a phone the page's scroll area keeps the bottom navigation's room free,
 * and a sticky offset counts from inside that room: bottom-2 puts the dock a
 * rem above the navigation. From md up it sits 1rem from the bottom.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  what = "changes",
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  /** What is unsaved, as a noun: "email changes". */
  what?: string
}) {
  const id = useId()
  const [nudge, setNudge] = useState(false)
  useEffect(() => {
    if (!dirty) return
    markUnsaved(id, what)
    return () => clearUnsaved(id)
  }, [dirty, what, id])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome before 119 and Safari ask only when returnValue is set.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  useEffect(() => {
    if (!dirty) return
    const onNudge = () => {
      setNudge(false)
      requestAnimationFrame(() => setNudge(true))
    }
    window.addEventListener(SAVE_NUDGE_EVENT, onNudge)
    return () => window.removeEventListener(SAVE_NUDGE_EVENT, onNudge)
  }, [dirty])

  if (!dirty && !saving) return null
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      data-save-dock=""
      data-nudge={nudge ? "true" : undefined}
      onAnimationEnd={() => setNudge(false)}
      className="set-dock sticky bottom-2 md:bottom-4"
    >
      <span className="set-dock-dot" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs font-medium text-foreground" aria-live="polite">
        {saving ? "Saving…" : "Unsaved changes"}
        <span className="sr-only">: {what}</span>
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save
        </Button>
      </div>
    </div>
  )
}
