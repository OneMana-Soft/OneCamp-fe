import type { SearchResult } from "@/services/searchService"

/** What a search hit names that a picker links to. */
export type HitRefKind = "doc" | "board" | "task" | "project" | "channel"

export interface HitRef {
  kind: HitRefKind
  id: string
  title: string
}

/**
 * A workspace search hit as the thing it names, by id and title, for every
 * picker that links one (the entity-link search, a table's link cell, the
 * reference pickers' + and # in text): one reading, by the ids the search
 * index carries (models/openSearch: a task's is task_id, a project's
 * project_id, a channel's ch_id with its name, ch_name).
 * Null for any other hit, or one with no id. Pure.
 */
export function hitRef(r: SearchResult): HitRef | null {
  if (r.type === "doc" && r.doc?.doc_uuid) return { kind: "doc", id: r.doc.doc_uuid, title: r.doc.doc_title || "Untitled doc" }
  if (r.type === "board" && r.board?.board_uuid) return { kind: "board", id: r.board.board_uuid, title: r.board.board_title || "Untitled board" }
  if (r.type === "task" && r.task?.task_id) return { kind: "task", id: r.task.task_id, title: r.task.task_name || "Untitled task" }
  if (r.type === "project" && r.project?.project_id) return { kind: "project", id: r.project.project_id, title: r.project.project_name || "Untitled project" }
  if (r.type === "channel" && r.channel?.ch_id && r.channel?.ch_name) return { kind: "channel", id: r.channel.ch_id, title: r.channel.ch_name }
  return null
}
