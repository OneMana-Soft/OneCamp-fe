"use client"

import { memo, useMemo } from "react"
import type { TaskActivityInterface } from "@/types/task"
import { ProgressiveList } from "@/components/ui/progressiveList"
import TaskActivity from "@/components/task/taskActivity"
import { EmptyState } from "@/components/ui/empty-state"
import { Activity } from "@/lib/icons"
import { collapseHistory, type HistoryLine } from "@/lib/tasks/activityStream"
import type { EarlierHistory } from "@/hooks/useEarlierHistory"

interface TaskActivitySectionProps {
    taskActivity?: TaskActivityInterface[]
    /** Older lines than these exist: a way to them above (hooks/useEarlierHistory). */
    earlier?: Pick<EarlierHistory, "more" | "loading" | "loadEarlier">
}

/** "Show earlier history" above a task's history while older lines exist (PROJ-BUG-8). */
export function EarlierHistoryButton({ earlier }: { earlier?: Pick<EarlierHistory, "more" | "loading" | "loadEarlier"> }) {
    if (!earlier?.more) return null
    return (
        <button
            type="button"
            data-earlier-history=""
            disabled={earlier.loading}
            onClick={() => void earlier.loadEarlier()}
            className="h-7 self-start rounded-sm px-2 text-xs font-[510] text-ink-2 transition-colors hover:bg-hover hover:text-foreground disabled:opacity-60"
        >
            {earlier.loading ? "Loading earlier history…" : "Show earlier history"}
        </button>
    )
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
function TaskActivitySection({ taskActivity, earlier }: TaskActivitySectionProps) {
    const lines = useMemo(() => collapseHistory(taskActivity), [taskActivity])
    return (
        <>
        <EarlierHistoryButton earlier={earlier} />
        <ProgressiveList
            items={lines}
            renderItem={(line) => <HistoryLineView line={line} />}
            getItemKey={(line) => line.first.activity_uuid || `${line.first.activity_type}-${line.at}`}
            emptyState={<EmptyState icon={Activity} title="No changes yet" description="Changes to this task show here." className="py-8" />}
            className="flex flex-col"
            initialCount={50}
            batchSize={50}
        />
        </>
    )
}

export default memo(TaskActivitySection)
