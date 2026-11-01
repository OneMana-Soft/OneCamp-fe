import { StatusGlyph, PriorityGlyph } from "@/components/ui/graphics/glyphs"
import { NobodyMark } from "@/components/ui/graphics/NobodyMark"
import { statusKindOf, type StatusLike } from "@/components/task/taskStatusCell"
import { priorityLevel } from "@/components/task/taskPriorityCell"
import { DesktopNavigationChatAvatar } from "@/components/navigationBar/desktop/desktopNavigationChatAvatar"
import { BotTag } from "@/components/ui/botTag"
import { CalendarDays, GitBranch, Hash, Link2, Milestone, Repeat, Tag, Users } from "@/lib/icons"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import type { ReactNode } from "react"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * One of the app's own marks, which a surface names (lib/ui/paletteEntries) and
 * the palette draws here as the app's menus do: a status as its glyph in its own
 * hue, a priority as its level, a person as their avatar (null: no one) and a
 * bot also as its tag, a tag as its hue, or a named glyph for an action. A surface whose actions are a chunk of their own
 * names its marks, so the chunk brings no mark's code (app/firstLoad.test.ts).
 * It lives beside its drawing, so no route reaches its words (docFirstLoad.test).
 */
export type PaletteMark =
  | { status: StatusLike }
  | { priority: string }
  | { person: Pick<UserProfileDataInterface, "user_uuid" | "user_name" | "is_bot"> | null }
  | { tag: string }
  | { glyph: PaletteGlyph }

/** An action's glyph: the status, priority and people facets' own (the work toolbar's), a link, a branch, a key, a tag, a due date (the task row's calendar), a cycle, a milestone. */
export type PaletteGlyph = "status" | "priority" | "people" | "link" | "branch" | "key" | "tag" | "due" | "cycle" | "milestone"

/**
 * The app's marks as the palette draws them (lib/ui/paletteEntries
 * PaletteMark), each as the app's own menus draw it: a status as its glyph
 * in its own hue (the task panel's status menu, TaskStatusCell), a priority
 * as its level (TaskPriorityCell), a person as the assignee picker's avatar,
 * and no one as its mark, a tag as the tag picker's dot in its hue. An
 * action's glyph is its facet's in the work toolbar (status, priority,
 * people), the task header's (link, branch, key), the task form's tag, the
 * Cycles view's repeat or a milestone's. Only the palette imports this, so it rides in the palette's chunk,
 * and a surface whose actions are a chunk of their own names a mark without
 * bringing its code (DESIGN-BUILD-57 on linear-28).
 */
export function PaletteMarkIcon({ mark }: { mark: PaletteMark }) {
  if ("status" in mark) return <StatusGlyph status={statusKindOf(mark.status)} hue={mark.status.hue} />
  if ("priority" in mark) return <PriorityGlyph level={priorityLevel(mark.priority)} />
  if ("person" in mark) {
    // The avatar reads what the person record has: a member's or an AI teammate's.
    return mark.person ? <DesktopNavigationChatAvatar userInfo={mark.person as UserProfileDataInterface} /> : <NobodyMark className="size-5" />
  }
  // The tag picker's dot in the tag's own hue (W06), never a tinted pill.
  if ("tag" in mark) return <span aria-hidden data-tag-hue="" className={cn(HUE_CLASS[hueFor(mark.tag)], "size-1.5 shrink-0 rounded-full bg-hue")} />
  switch (mark.glyph) {
    case "status":
      return <StatusGlyph status="progress" />
    case "priority":
      return <PriorityGlyph level={3} />
    case "people":
      return <Users className="h-4 w-4" />
    case "link":
      return <Link2 className="h-4 w-4" />
    case "branch":
      return <GitBranch className="h-4 w-4" />
    case "key":
      return <Hash className="h-4 w-4" />
    case "tag":
      return <Tag className="h-4 w-4" />
    case "due":
      return <CalendarDays className="h-4 w-4" />
    case "cycle":
      return <Repeat className="h-4 w-4" />
    case "milestone":
      return <Milestone className="h-4 w-4" />
  }
}

/**
 * What a mark adds at its row's end: a bot's tag, "Agent" when an AI is behind
 * it, as the assignee picker tags an AI teammate. Assigning hands the task to
 * the agent and starts its run, so its kind shows before the pick
 * (DESIGN-BUILD-58 on linear-28).
 */
export function paletteMarkTag(mark: PaletteMark): ReactNode {
  return "person" in mark && mark.person?.is_bot ? <BotTag userUUID={mark.person.user_uuid} /> : null
}
