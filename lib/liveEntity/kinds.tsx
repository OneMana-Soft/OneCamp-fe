"use client"

import { Calendar, FileText, FolderKanban, ListTodo, User } from "@/lib/icons"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ChatFace } from "@/components/message/chatFace"
import { CATEGORY_KIND, isClosedStatus, type StatusCategory } from "@/lib/taskStatus"
import { isoDate } from "@/lib/codec/connectedValues"
import { MqttMessageType } from "@/services/mqttService"
import { setLastAnchor } from "@/lib/hub/lastAnchor"
import { openUI } from "@/store/slice/uiSlice"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { PHONE_QUERY } from "@/context/MediaQueryContext"
import store from "@/store/store"
import { dateLabel, dayTone } from "./dates"
import { workRoute } from "@/lib/work/route"
import { followHref, wantsNewTab, type LinkClick } from "./follow"
import { registerEntityKind } from "./registry"
import type { EntityRead, TopicMessage } from "./types"

/**
 * The kinds docs draw (C1): pages, tasks, projects, people and dates. Each is
 * read through POST /entities except dates, which are only a day.
 */

export interface DocChipData {
  title: string
  icon?: string
  parent_id?: string
  /** The doc's space, when it lives in one ("project" and the project's id). */
  space_kind?: string
  space_id?: string
}

export interface TaskChipData {
  name: string
  status: StatusCategory
  status_name: string
  done: boolean
  /** The reader may change it: one of its project's admins. */
  can_edit: boolean
  /** "2026-10-20" */
  due?: string
  assignee?: { uuid: string; name: string; avatar_key?: string | null }
  project_id?: string
  project_name?: string
  /** "Q4-12"; none until its project has a key. */
  key?: string
}

export interface ProjectChipData {
  name: string
  can_edit: boolean
}

interface PersonChipData {
  name: string
  avatar_key?: string | null
  is_bot?: boolean
}

interface DateChipData {
  date: string
}

const about = (m: TopicMessage, field: string, id: string) => String(m.data?.[field] ?? "").toLowerCase() === id.toLowerCase()

const cards = () => import("@/components/liveEntity/EntityCards")

/** Opens a task beside what's open, in the task panel, as a project's lists do: false on a phone, where it has no room. */
function openTaskBeside(id: string): boolean {
  if (window.matchMedia(PHONE_QUERY).matches) return false
  store.dispatch(openRightPanel({ taskUUID: id }))
  return true
}

/** Opens a task as everything that names one does: beside, or its own page on a phone or for a new tab. */
export function openTask(id: string, e: LinkClick, push: (href: string) => void): void {
  if (wantsNewTab(e) || !openTaskBeside(id)) followHref(workRoute({ task: id }), e, push)
}

registerEntityKind<DocChipData>({
  kind: "doc",
  icon: FileText,
  noun: "page",
  opensWithoutAccess: true,
  // Renamed, moved, deleted or restored, its icon or access changed (A6's meta events).
  hears: (m, id) => m.type === MqttMessageType.Doc_Meta && about(m, "doc_uuid", id),
  view: (d) => ({ lead: <DocIcon icon={d.icon} size={14} />, title: d.title || "Untitled" }),
  href: (id) => `/app/doc/${id}`,
})

registerEntityKind<TaskChipData>({
  kind: "task",
  icon: ListTodo,
  noun: "task",
  // Reread names no task: whatever is said about a task only a few may see
  // reaches its project as Reread, since every member hears that topic.
  hears: (m, id) =>
    (m.type === MqttMessageType.Task_Changed || m.type === MqttMessageType.Task_Dates) && (about(m, "task_uuid", id) || m.data?.reread === true),
  view: (t, _id, { today }) => {
    const tone = t.due ? dayTone(t.due, today, isClosedStatus(t.status)) : undefined
    return {
      // A chip toned for its day is a tint (EntityChip, CHIP_TONE).
      lead: <StatusGlyph status={CATEGORY_KIND[t.status] ?? "todo"} size={14} label={t.status_name} onTint={tone !== undefined} />,
      tag: t.key,
      title: t.name || "Untitled task",
      trailing: t.due ? dateLabel(t.due, today) : undefined,
      tone,
    }
  },
  href: (id) => workRoute({ task: id }),
  // Beside the doc in the task panel, as the project's lists open it; on a phone, its page.
  open: openTaskBeside,
  card: () => cards().then((m) => ({ default: m.TaskCard })),
})

registerEntityKind<ProjectChipData>({
  kind: "project",
  icon: FolderKanban,
  noun: "project",
  view: (p) => ({ lead: <FolderKanban className="size-3.5 text-ink-3" aria-hidden="true" />, title: p.name || "Untitled project" }),
  href: (id) => workRoute({ project: id }),
})

registerEntityKind<PersonChipData>({
  kind: "person",
  icon: User,
  noun: "person",
  view: (p, id) => ({ lead: <ChatFace name={p.name} profileKey={p.avatar_key} userUUID={id} isBot={p.is_bot} size={16} />, title: p.name }),
  href: () => null,
  // Their card, as everywhere a person is named.
  open: (id, _p, anchor) => {
    setLastAnchor(anchor)
    store.dispatch(openUI({ key: "otherUserProfile", data: { userUUID: id } }))
    return true
  },
})

registerEntityKind<DateChipData>({
  kind: "date",
  icon: Calendar,
  noun: "date",
  // A day reads nothing: it only ages, against today (today.ts).
  read: async (ids) => new Map(ids.map((id): [string, EntityRead<DateChipData>] => [id, isoDate(id) ? { access: "ok", data: { date: id } } : { access: "none" }])),
  view: (d, _id, { today }) => ({ title: dateLabel(d.date, today) }),
  href: () => null,
})
