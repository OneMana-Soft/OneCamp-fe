"use client"

import { useMemo, useState } from "react"
import { ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { TaskFinderRow } from "@/components/task/taskFinderRow"
import { useDebounce } from "@/hooks/useDebounce"
import { useFetch } from "@/hooks/useFetch"
import { isClosedStatus } from "@/lib/taskStatus"
import { taskListQuery } from "@/lib/tasks/listQuery"
import { shortDate } from "@/lib/utils/date/shortDate"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import type { UserInfoRawInterface } from "@/types/user"

/** The rows one ask reads: a finder, not the whole list. */
const ROWS = 30

/**
 * The ask for your tasks, as My Tasks makes it (/user/assignedTaskList, by
 * taskListQuery): any of yours by its name once something is typed, else your
 * open ones due by `dueBy` (the server's open filter, overdue first), soonest
 * first. Pure.
 */
export function taskFinderQuery(search: string, dueBy: Date): string {
  const q = search.trim()
  const query = taskListQuery({ sort: [{ id: "task_due_date", desc: false }], search: q, pageSize: ROWS, pageIndex: 0 })
  if (!q) query.set("dueBy", dueBy.toISOString())
  return `${GetEndpointUrl.GetUserTaskList}?${query}`
}

export interface TaskFinderProps {
  /** The task picked, as the list read it. */
  onPick: (task: TaskInfoInterface) => void
  /** With nothing typed, your open tasks due by this moment. */
  dueBy: Date
}

/**
 * Your tasks to pick one from (calendar B1: time for a task): the filter and
 * rows of PickTask's combobox, which leaves the search to the server. It reads
 * the tasks assigned to you as My Tasks reads them, so a change to a task
 * reaches it as it reaches every assigned list (useTaskUpdate). Each row is a
 * TaskFinderRow; a finished task is never offered.
 */
export function TaskFinder({ onPick, dueBy }: TaskFinderProps) {
  const [text, setText] = useState("")
  const search = useDebounce(text, 200).trim()
  const { data, isLoading } = useFetch<UserInfoRawInterface>(taskFinderQuery(search, dueBy), undefined, { keepPreviousData: true, revalidateOnFocus: false })
  const tasks = useMemo(() => (data?.data?.user_tasks ?? []).filter((t) => !isClosedStatus(t.task_status)), [data])
  const by = shortDate(dueBy)

  return (
    <>
      <ComboboxInput value={text} onValueChange={setText} placeholder="Find one of your tasks…" />
      <ComboboxList>
        <ComboboxEmpty>
          {isLoading && !data ? "Looking for your tasks…" : search ? `No open task of yours matches “${search}”.` : `Nothing of yours is due by ${by}. Type a task's name to find it.`}
        </ComboboxEmpty>
        {tasks.length ? (
          <ComboboxGroup heading={search ? "Your tasks" : `Due by ${by}`}>
            {tasks.map((t) => (
              <ComboboxItem key={t.task_uuid} value={t.task_uuid} onSelect={() => onPick(t)} className="items-start gap-2.5 py-1.5">
                <TaskFinderRow task={t} />
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        ) : null}
      </ComboboxList>
    </>
  )
}
