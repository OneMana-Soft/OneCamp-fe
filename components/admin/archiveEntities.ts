import type { LucideIcon } from "lucide-react"

import type { CampHue } from "@/lib/campHue"
import { Database, FileText, Hash, ListTodo, MessageCircle, Paperclip, Video } from "@/lib/icons"

/**
 * The kinds of thing the archive holds, each with its name, its icon and its
 * camp hue: one map, so channel posts are the same sky tile in the counts, in
 * their archive rule, in the history and in the dialog that runs them. The
 * archive card, its run dialog and its restore dialog each kept their own copy
 * of the names (in Title Case), and the icons sat in grey chips.
 *
 * Identity colour only: status keeps its status tokens, and the accent keeps
 * the one primary action.
 */
export type ArchiveEntity = "posts" | "chats" | "tasks" | "docs" | "recordings" | "attachments"

export interface ArchiveEntityInfo {
  label: string
  icon: LucideIcon
  hue: CampHue
}

export const ARCHIVE_ENTITIES: Record<ArchiveEntity, ArchiveEntityInfo> = {
  posts: { label: "Channel posts", icon: Hash, hue: "sky" },
  chats: { label: "Direct messages", icon: MessageCircle, hue: "lake" },
  tasks: { label: "Tasks", icon: ListTodo, hue: "moss" },
  docs: { label: "Documents", icon: FileText, hue: "dusk" },
  recordings: { label: "Recordings", icon: Video, hue: "berry" },
  attachments: { label: "Attachments", icon: Paperclip, hue: "sun" },
}

/** The order the archive lists them in. */
export const ARCHIVE_ENTITY_ORDER: ArchiveEntity[] = ["posts", "chats", "tasks", "docs", "recordings", "attachments"]

/** A kind's name, icon and hue, or a plain fallback for one this build doesn't know. */
export function archiveEntity(type: string): ArchiveEntityInfo {
  return ARCHIVE_ENTITIES[type as ArchiveEntity] ?? { label: type, icon: Database, hue: "sun" }
}
