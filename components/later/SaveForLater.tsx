"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { springPop } from "@/lib/spring"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Bookmark, CalendarClock, Check, Clock, Trash2 } from "@/lib/icons"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import { type LaterItemType, reminderChoices, reminderLabel } from "@/lib/utils/later"
import { cn } from "@/lib/utils/helpers/cn"

// Remind me's own date and time, loaded when it is first asked for.
const ReminderPicker = dynamic(() => import("@/components/later/reminderPicker"), { ssr: false })

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
  const [menuOpen, setMenuOpen] = useState(false)
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

  // Saved is the bookmark filled in the accent, and it springs the moment it
  // fills (hub.md L4). No sparks: saving is routine. A bookmark already filled
  // when the page loads stands still.
  const trigger = useRef<HTMLButtonElement>(null)
  const wasSaved = useRef<boolean | null>(null)
  useEffect(() => {
    if (wasSaved.current === false && saved) springPop(trigger.current?.querySelector("svg"))
    wasSaved.current = Boolean(saved)
  }, [saved])

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          setMenuOpen(open)
          onOpenChange?.(open)
        }}
        modal={false}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                ref={trigger}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                aria-pressed={Boolean(saved)}
                disabled={busy}
                data-saved={saved ? "" : undefined}
                // While its menu or Remind me is open, ink: not a second orange thing beside Set reminder.
                data-tone={menuOpen || picking ? "neutral" : undefined}
                className={cn(
                  "h-8 w-8 rounded-md text-ink-3 hover:text-foreground",
                  saved && "text-brand hover:text-brand [&_svg]:fill-current [&_svg]:!text-brand",
                  className,
                )}
              >
                <Bookmark className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        {/* Each choice on one line: "Tomorrow morning" wrapped to a 52px row (QA F-38). */}
        <DropdownMenuContent align="end" className="w-[264px]">
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
              <span className="flex-1 whitespace-nowrap">{c.label}</span>
              <span className="ml-3 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{c.hint}</span>
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
      {picking ? (
        <ReminderPicker
          initial={saved?.remind_at ? new Date(saved.remind_at) : undefined}
          onClose={() => setPicking(false)}
          onPick={(at) => {
            setPicking(false)
            void saveWith(at)
          }}
        />
      ) : null}
    </>
  )
}
