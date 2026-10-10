"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Bookmark, BookmarkCheck, CalendarClock, Check, Clock, Trash2 } from "@/lib/icons"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import { type LaterItemType, reminderChoices, reminderLabel, toLocalInput } from "@/lib/utils/later"
import { cn } from "@/lib/utils/helpers/cn"

/** The thing being saved, as the Later list will show and open it. */
export interface LaterTarget {
  itemType: LaterItemType
  itemId: string
  link: string
  title: string
  context?: string
}

/**
 * Save for later, with an optional reminder. One button: a bookmark that
 * fills in once the thing is saved, opening a short menu. Saving with a
 * reminder is one click ("Tomorrow morning"), not a form.
 */
export function SaveForLaterButton({
  target,
  onOpenChange,
  className,
}: {
  target: LaterTarget
  /** Lets a hover toolbar stay visible while the menu is open. */
  onOpenChange?: (open: boolean) => void
  className?: string
}) {
  const saved = useSavedEntry(target.itemType, target.itemId)
  const { save, remind, done, remove } = useLaterActions()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const now = new Date()
  const label = saved ? "Saved for later" : "Save for later"

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch {
      // The request layer has said what went wrong.
    } finally {
      setBusy(false)
    }
  }

  const saveWith = (at: Date | null) =>
    run(() =>
      saved
        ? remind(saved.id, at)
        : save({
            item_type: target.itemType,
            item_id: target.itemId,
            link: target.link,
            title: target.title,
            context: target.context,
            remind_at: at ? at.toISOString() : null,
          }),
    )

  const Icon = saved ? BookmarkCheck : Bookmark

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange} modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                disabled={busy}
                className={cn(
                  "h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent",
                  saved && "text-primary hover:text-primary",
                  className,
                )}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {saved
              ? saved.remind_at
                ? `Saved. Reminder: ${reminderLabel(new Date(saved.remind_at), now).text}`
                : "Saved for later"
              : "Save for later"}
          </DropdownMenuLabel>
          {!saved && (
            <DropdownMenuItem onSelect={() => saveWith(null)}>
              <Bookmark className="h-4 w-4" />
              Save, no reminder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {saved ? "Change the reminder" : "Save and remind me"}
          </DropdownMenuLabel>
          {reminderChoices(now).map((c) => (
            <DropdownMenuItem key={c.key} onSelect={() => saveWith(c.at)}>
              <Clock className="h-4 w-4" />
              <span className="flex-1">{c.label}</span>
              <span className="ml-3 text-xs tabular-nums text-muted-foreground">{c.hint}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setPicking(true)}>
            <CalendarClock className="h-4 w-4" />
            Pick a date and time…
          </DropdownMenuItem>
          {saved && (
            <>
              {saved.remind_at && (
                <DropdownMenuItem onSelect={() => run(() => remind(saved.id, null))}>
                  <Clock className="h-4 w-4" />
                  Remove the reminder
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => run(() => done(saved.id, true))}>
                <Check className="h-4 w-4" />
                Mark done
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => remove(saved.id))}>
                <Trash2 className="h-4 w-4" />
                Remove from Later
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReminderPicker
        open={picking}
        onOpenChange={setPicking}
        initial={saved?.remind_at ? new Date(saved.remind_at) : undefined}
        onPick={(at) => {
          setPicking(false)
          void saveWith(at)
        }}
      />
    </>
  )
}

/** A date and time of the person's choosing, within the next year. */
function ReminderPicker({
  open,
  onOpenChange,
  initial,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Date
  onPick: (at: Date) => void
}) {
  const now = new Date()
  const fallback = reminderChoices(now).find((c) => c.key === "tomorrow")!.at
  const [value, setValue] = useState(() => toLocalInput(initial && initial > now ? initial : fallback))
  const max = new Date(now.getTime() + 365 * 86_400_000)
  const at = value ? new Date(value) : null
  const problem = !at || Number.isNaN(at.getTime())
    ? "Choose a date and time."
    : at <= now
      ? "Choose a time that has not passed yet."
      : at > max
        ? "Choose a time within the next year."
        : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remind me</DialogTitle>
          <DialogDescription>It comes back to the top of Later, and to your phone if notifications are on.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!problem && at) onPick(at)
          }}
          className="space-y-3"
        >
          <Input
            type="datetime-local"
            aria-label="Reminder date and time"
            value={value}
            min={toLocalInput(now)}
            max={toLocalInput(max)}
            onChange={(e) => setValue(e.target.value)}
          />
          {value && problem && <p className="text-xs text-danger-ink">{problem}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(problem)}>
              Set reminder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
