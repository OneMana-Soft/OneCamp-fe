"use client"

import { memo, useMemo } from "react"
import type { TaskActivityInterface } from "@/types/task"
import { ProgressiveList } from "@/components/ui/progressiveList"
import TaskActivity from "@/components/task/taskActivity"
import { EmptyState } from "@/components/ui/empty-state"
import { Activity } from "@/lib/icons"
import { collapseHistory, type HistoryLine } from "@/lib/tasks/activityStream"

interface TaskActivitySectionProps {
    taskActivity?: TaskActivityInterface[]
}

const noProfile = () => {}

/** One history line, folded or single (W32). */
export function HistoryLineView({ line }: { line: HistoryLine }) {
    return <TaskActivity taskActivity={line.first} line={line} openOtherUserProfile={noProfile} />
}

/**
 * A task's history (the stream's History filter): one person's changes
 * within five minutes fold into one line, oldest first.
 */
function TaskActivitySection({ taskActivity }: TaskActivitySectionProps) {
    const lines = useMemo(() => collapseHistory(taskActivity), [taskActivity])
    return (
        <ProgressiveList
            items={lines}
            renderItem={(line) => <HistoryLineView line={line} />}
            getItemKey={(line) => line.first.activity_uuid || `${line.first.activity_type}-${line.at}`}
            emptyState={<EmptyState icon={Activity} title="No changes yet" description="Changes to this task show here." className="py-8" />}
            className="flex flex-col"
            initialCount={50}
            batchSize={50}
        />
    )
}

export default memo(TaskActivitySection)
