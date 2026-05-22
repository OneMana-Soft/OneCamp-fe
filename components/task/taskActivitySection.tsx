"use client"

import { memo } from "react"
import type { TaskActivityInterface } from "@/types/task"
import { ProgressiveList } from "@/components/ui/progressiveList"
import TaskActivity from "@/components/task/taskActivity";
import { EmptyState } from "@/components/ui/empty-state"
import { Activity } from "lucide-react";

interface TaskActivitySectionProps {
    taskActivity?: TaskActivityInterface[]
}



function TaskActivitySection({ taskActivity }: TaskActivitySectionProps) {
    const openOtherUserProfile = (id: string) => {
        // Implementation
    }

    return (
        <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-5 bottom-0 w-px border bg-secondary" />

            <ProgressiveList
                items={taskActivity}
                renderItem={(activity) => <TaskActivity taskActivity={activity} openOtherUserProfile={openOtherUserProfile} />}
                getItemKey={(activity) => activity.activity_uuid || ''}
                emptyState={<EmptyState icon={Activity} title="No activities yet" description="Task activities will appear here as changes are made." className="py-6" />}
                className="space-y-6"
                initialCount={50}
                batchSize={50}
            />
        </div>
    )
}

export default memo(TaskActivitySection)
