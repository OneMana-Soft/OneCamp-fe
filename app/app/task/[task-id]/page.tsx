"use client";

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import TaskInfoPanel from "@/components/rightPanel/taskInfoPanel"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { Skeleton } from "@/components/ui/skeleton"
import { isTaskKey, resolveTask } from "@/lib/work/keysApi"
import { app_my_task_path } from "@/types/paths"

/**
 * /app/task/[task-id]: the full task page (design v3, work.md W37), by its
 * id or by its key (/app/task/Q4-12, projects A8K).
 *
 * On a phone it is the task panel as a page. On a desktop it was no page at
 * all: it opened the right panel over My Tasks and replaced the URL, so
 * "Open the full page" in the panel's header led straight back into the
 * panel. Now it is the task on its own, in two columns: title, description,
 * subtasks and activity on the left, the properties as a sticky rail on the
 * right (TaskInfoPanel's onPage layout).
 */
export default function Page() {
    const params = useParams()
    const ref = decodeURIComponent((params?.["task-id"] as string) ?? "")
    if (!ref) return null
    if (isTaskKey(ref)) return <TaskByKey taskKey={ref} />
    return <TaskPage taskUUID={ref} />
}

function TaskPage({ taskUUID }: { taskUUID: string }) {
    return (
        <div className="h-full min-h-0" data-task-page="">
            <TaskInfoPanel key={taskUUID} taskUUID={taskUUID} onPage />
        </div>
    )
}

/** A key finds its task's id first; a key that names nothing the reader can open says so, as an id would. */
function TaskByKey({ taskKey }: { taskKey: string }) {
    const [found, setFound] = useState<{ uuid?: string; error?: unknown }>({})
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        let live = true
        resolveTask(taskKey).then(
            (r) => live && setFound({ uuid: r.task_uuid }),
            (error) => live && setFound({ error }),
        )
        return () => {
            live = false
        }
    }, [taskKey, attempt])
    if (found.uuid) return <TaskPage taskUUID={found.uuid} />
    if (found.error) {
        return (
            <div className="flex h-full flex-col" data-task-page="">
                <LoadFailureState
                    error={found.error}
                    noun="task"
                    onRetry={() => {
                        setFound({})
                        setAttempt((n) => n + 1)
                    }}
                    back={{ label: "Back to My Tasks", href: app_my_task_path }}
                    goneDetail={`There's no task ${taskKey.toUpperCase()} that you can open. If someone sent you the link, it may be in a project you're not in.`}
                    noAccessDetail="It's in a project you're not in. Ask one of the project's admins to add you."
                    className="m-auto pt-0"
                />
            </div>
        )
    }
    return (
        <div className="space-y-3 p-6" data-task-page="" aria-busy="true" aria-label={`Opening ${taskKey.toUpperCase()}`}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
        </div>
    )
}
