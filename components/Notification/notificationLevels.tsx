"use client"

import { Bell, BellOff, LoaderCircle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationType } from "@/types/channel"

/** What a person hears about from a project: each level, in the words its menu uses. */
export const NOTIFICATION_LEVELS = [
  { value: NotificationType.NotificationAll, label: "All activity", detail: "New tasks, changes and comments" },
  { value: NotificationType.NotificationMention, label: "Mentions only", detail: "When someone mentions you" },
  { value: NotificationType.NotificationBlock, label: "Muted", detail: "Nothing, until you change it" },
] as const

/** A level's name ("Mentions only"), or All activity for one this build doesn't know. */
export function notificationLevelLabel(level: string): string {
  return (NOTIFICATION_LEVELS.find((l) => l.value === level) ?? NOTIFICATION_LEVELS[0]).label
}

/**
 * The levels as a menu's radio items, the one chosen ticked: a level changes
 * only when one is picked. The bell cycled to the next level on one click,
 * and its icon swapped to "@" without a word (PTC-26).
 */
export function NotificationLevelItems({ level, onChoose }: { level: string; onChoose: (level: string) => void }) {
  return (
    <DropdownMenuRadioGroup value={level} onValueChange={(v) => v !== level && onChoose(v)}>
      {NOTIFICATION_LEVELS.map((l) => (
        <DropdownMenuRadioItem key={l.value} value={l.value} className="items-start py-1.5">
          <span className="flex flex-col">
            <span>{l.label}</span>
            <span className="text-meta text-ink-3">{l.detail}</span>
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

/** The bell in a header: it shows the level, and opens the levels to choose from. */
export function NotificationLevelMenu({ level, onChoose, busy = false }: { level: string; onChoose: (level: string) => void; busy?: boolean }) {
  const label = notificationLevelLabel(level)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Notifications: ${label}`} title={`Notifications: ${label}`} disabled={busy}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : level === NotificationType.NotificationBlock ? (
            <BellOff className="size-4" aria-hidden />
          ) : (
            <span className="relative inline-flex">
              <Bell className="size-4" aria-hidden />
              {level === NotificationType.NotificationMention && (
                <span aria-hidden className="absolute -right-1.5 -top-1 rounded-sm bg-background px-0.5 text-2xs font-bold leading-tight ring-1 ring-border">
                  @
                </span>
              )}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-meta text-ink-3">Notify me about</DropdownMenuLabel>
        <NotificationLevelItems level={level} onChoose={onChoose} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
