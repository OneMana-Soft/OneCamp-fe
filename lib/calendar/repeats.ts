import type { CalendarEventInterface } from "@/types/calendar"
import type { TaskInfoInterface } from "@/types/task"
import { CHECK_IN } from "@/lib/calendar/repeatsPath"
import { placeHue } from "@/lib/placeHue"

/** What repeats beside the events (head 9, gcal-1b): GET /calendar/repeats. Pure. */
export interface RepeatsView {
  checkins: { id: string; channel_uuid: string; channel_name: string; question: string; at: string[] }[]
  tasks: { task_uuid: string; task_name: string; project_uuid?: string; project_name?: string; rule: string; due: string[] }[]
}

/** Each time a check-in asks: a quarter hour nobody moves. */
export function checkInEvents(view: RepeatsView | undefined): CalendarEventInterface[] {
  const out: CalendarEventInterface[] = []
  for (const c of view?.checkins ?? []) {
    for (const at of c.at) {
      const start = Date.parse(at)
      if (Number.isNaN(start)) continue
      out.push({
        event_uuid: `${CHECK_IN}${c.channel_uuid}-${c.id}-${start}`,
        event_title: c.channel_name ? `#${c.channel_name} check-in` : "Check-in",
        event_description: c.question,
        event_start_time: new Date(start).toISOString(),
        event_end_time: new Date(start + 9e5).toISOString(),
        event_read_only: true,
        // The channel's own hue, as it wears everywhere: not your calendar's (DB-24).
        event_hue: placeHue("channel", c.channel_uuid),
      })
    }
  }
  return out
}

/** Each date a repeating task comes due next: the task, marked ahead, its id "<task>@<due>" so each date keys alone (taskOfAhead). */
export function tasksAhead(view: RepeatsView | undefined): TaskInfoInterface[] {
  const out: TaskInfoInterface[] = []
  for (const t of view?.tasks ?? []) {
    for (const due of t.due) {
      if (Number.isNaN(Date.parse(due))) continue
      out.push({
        task_uuid: `${t.task_uuid}@${due}`,
        task_name: t.task_name,
        task_status: "todo",
        task_due_date: due,
        task_start_date: "",
        task_project: t.project_uuid ? { project_uuid: t.project_uuid, project_name: t.project_name ?? "" } : undefined,
        task_ahead: true,
      } as unknown as TaskInfoInterface)
    }
  }
  return out
}
