"use client"

// The parts a settings page is made of, so every one reads the same way: a
// section is a heading, at most one line under it, and a hairline list of
// rows; a row is a label, its help, and its control on the right.
//
// And one way to save. A page whose changes wait for a Save button says so in
// a bar that appears only while there is something to save, stays in view
// while you scroll, and offers to put things back. The button used to sit at
// the bottom of a long page, below sections that saved the moment you touched
// them, so nothing said which kind a switch was.

import * as React from "react"
import { useEffect, useId } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "@/lib/icons"
import { clearUnsaved, markUnsaved } from "@/lib/unsavedChanges"

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {description && <p className="max-w-[65ch] text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** Rows that belong together, between hairlines. */
export function SettingsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border rounded-lg border border-border", className)}>{children}</div>
}

/** A switch with its label and help, the label tied to it so clicking the words toggles it. */
export function SwitchRow(props: {
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="text-sm font-medium leading-5">
          {props.label}
        </Label>
        {props.description && (
          <p id={`${id}-desc`} className="text-xs text-muted-foreground text-pretty">
            {props.description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        className="mt-0.5 shrink-0"
        aria-describedby={props.description ? `${id}-desc` : undefined}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
    </div>
  )
}

/**
 * Any other setting's row: its name and help on the left, its control (a select,
 * an input, a button) on one line at the row's end, at a switch row's padding,
 * so a list mixing the two keeps one rhythm. On a phone the control goes under
 * the words.
 *
 * The row never rewrites its child. It ties the label to the control by
 * `controlId` (the control carries that id), and gives the help the id
 * `${controlId}-desc` for the control to name in aria-describedby when it
 * should.
 */
export function SettingRow({
  label,
  description,
  controlId,
  children,
  className,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  /** The id the control carries, so clicking the label focuses it. */
  controlId: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={controlId} className="text-sm font-medium leading-5">
          {label}
        </Label>
        {description && (
          <p id={`${controlId}-desc`} className="text-xs text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/**
 * Unsaved changes, in view until they are saved or put back. Also asks
 * before the tab is closed or reloaded with them unsaved.
 *
 * On a phone the page's scroll area keeps the bottom navigation's room free
 * (4rem plus the home indicator's inset, mobileNavigationBar), and a sticky
 * offset counts from inside that room: bottom-2 puts the bar 4.5rem plus the
 * inset from the screen's edge, a rem above the 3.5rem navigation. From md up
 * it sits 1rem from the bottom.
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
  // While there is something to save, say so to anything that leads away:
  // the guard on in-app links and the admin page's section menu ask first.
  const id = useId()
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

  if (!dirty && !saving) return null
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-2 md:bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-popover px-4 py-2.5 shadow-overlay"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {saving ? "Saving…" : `You have unsaved ${what}.`}
      </p>
      <div className="flex shrink-0 items-center gap-2">
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
