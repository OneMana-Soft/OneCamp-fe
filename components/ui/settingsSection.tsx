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

/**
 * A section: its title, at most one line under it, and its content 12px below.
 *
 * Every admin tab and settings page is a stack of these, so a tab's first title
 * sits at the same place on every tab. Seven admin cards used to be bordered
 * Cards with a p-4 header instead, which moved the title 17px right and down,
 * boxed the content and narrowed it, and drew their titles as divs in another
 * face; switching tabs moved everything.
 *
 * `action` is the section's one primary action (or a couple of quiet ones), on
 * the title's row at its end, where the task panel keeps "Mark complete"; under
 * sm it goes under the words, so a long description never squeezes beside it.
 * `level` 3 is a section inside a section: a 14px title.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
  action,
  level = 2,
  id: sectionId,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
  level?: 2 | 3
  /** An id for the section itself, for a jump link. */
  id?: string
}) {
  const id = useId()
  const Heading = level === 3 ? "h3" : "h2"
  const heading = (
    <div className="min-w-0 space-y-1">
      <Heading id={id} className={level === 3 ? "text-sm font-medium" : "text-base font-semibold"}>
        {title}
      </Heading>
      {description && <p className="max-w-[65ch] text-sm text-muted-foreground text-pretty">{description}</p>}
    </div>
  )
  return (
    <section id={sectionId} aria-labelledby={id} className={cn("space-y-3", className)}>
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
 * from md up and 44px on a phone, where it is a touch target. Members' "Invite
 * people" was 32px and Admins' "Add admin" 36px, a step apart on adjacent tabs.
 */
export const sectionActionClass = "h-11 md:h-8"

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
 *
 * Side by side only when the ROW is wide enough (36rem, a container query), not
 * the window: in the invitation email's editor column, 430px wide on a 1440px
 * screen, the sender address's help was squeezed to 115px beside its input and
 * ran ten lines of one or two words. Narrower than that, the control goes under
 * the words, as on a phone.
 *
 * `layout="stacked"` always puts the control under the words at full width: a
 * textarea, a list of addresses, a key to paste.
 */
export function SettingRow({
  label,
  description,
  controlId,
  children,
  className,
  layout = "inline",
}: {
  label: React.ReactNode
  description?: React.ReactNode
  /** The id the control carries, so clicking the label focuses it. */
  controlId: string
  children: React.ReactNode
  className?: string
  layout?: "inline" | "stacked"
}) {
  const words = (
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
  )
  if (layout === "stacked") {
    return (
      <div data-setting-row="stacked" className={cn("space-y-2 px-4 py-3", className)}>
        {words}
        <div className="min-w-0">{children}</div>
      </div>
    )
  }
  return (
    <div data-setting-row="" className={cn("@container px-4 py-3", className)}>
      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-6">
        {words}
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
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
