"use client";

import { useParams } from "next/navigation"
import TaskInfoPanel from "@/components/rightPanel/taskInfoPanel"

/**
 * /app/task/[task-id]: the full task page (design v3, work.md W37).
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
    const taskId = params?.["task-id"] as string
    if (!taskId) return null
    return (
        <div className="h-full min-h-0" data-task-page="">
            <TaskInfoPanel key={taskId} taskUUID={taskId} onPage />
        </div>
    )
}
