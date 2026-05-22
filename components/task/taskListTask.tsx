import {TaskInfoInterface} from "@/types/task";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";
import {priorities, prioritiesInterface, taskStatuses} from "@/types/table";
import {TaskStatusCell} from "@/components/task/taskStatusCell";
import {TaskAssigneeCell} from "@/components/task/taskAssigneeCell";
import {ColorIcon} from "@/components/colorIcon/colorIcon";
import {Badge} from "@/components/ui/badge";
import { CheckCircle2, GitBranch, MessageSquare } from "@/lib/icons";
import { GitHubBadgeGroup } from "@/components/task/PRStatusBadge";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {format} from "date-fns";
import { app_task_path} from "@/types/paths";
import Link from "next/link";
import React, {useCallback} from "react";
import {cn} from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";

export const TaskListTask = ({
  taskInfo,
  onToggleStatus,
  isAdmin,
  isAnimating,
  selectionMode,
  isSelected,
  onToggleSelect,
}: {
  taskInfo: TaskInfoInterface
  onToggleStatus: (task_uuid: string, projectId: string, newStatus: "done" | "todo") => void
  isAdmin: boolean
  isAnimating: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (taskUUID: string) => void
}) => {

    const taskHref = `${app_task_path}/${taskInfo.task_uuid}`;

    const sd = new Date(taskInfo.task_start_date)
    const dd = new Date(taskInfo.task_due_date)
    const cd = new Date(taskInfo.task_created_at)

    const isCompleted = taskInfo.task_status === 'done'

    const handleToggleClick = useCallback(() => {
        onToggleStatus(taskInfo.task_uuid, taskInfo?.task_project?.project_uuid, isCompleted ? "todo" : "done")
    }, [onToggleStatus, taskInfo.task_uuid, isCompleted])

    const handleDoneClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        handleToggleClick()
    }, [handleToggleClick])
    const priority = priorities.find(
        (priority: prioritiesInterface) => priority.value === taskInfo.task_priority
    );

    const status = taskStatuses.find(
        (status: prioritiesInterface) => status.value === taskInfo.task_status
    );

    return (
        <div className={cn("flex items-start gap-3 px-3 py-3 border-b hover:bg-accent/40 transition-colors duration-150", isAnimating && "animate-gradient-completion", isSelected && "bg-accent/60")} >
            <div className={cn("mt-0.5 flex flex-col items-center gap-2", selectionMode ? "w-10" : "w-6")}>
                {selectionMode && (
                    <div
                        className="flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                        data-no-ripple
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect?.(taskInfo.task_uuid)}
                            className="h-4 w-4 cursor-pointer accent-primary"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )}
                <button
                    onClick={handleDoneClick}
                    className="flex items-center justify-center"
                    aria-label={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                    type="button"
                    disabled={!isAdmin}
                >
                    {isCompleted ? (
                        <CheckCircle2 className={cn("w-5 h-5", statusColors.success.text)}/>
                    ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/40"/>
                    )}
                </button>

            </div>
            <Link href={taskHref} className="flex-1 min-w-0" onClick={(e) => { if (selectionMode) e.preventDefault() }}>
                <div className="flex items-center gap-2 mb-1">
                    {taskInfo.task_label && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{taskInfo.task_label}</Badge>}
                    <span className="text-sm font-medium truncate">{taskInfo.task_name}</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {priority && <TaskPriorityCell priority={priority}/>}
                    {status && <TaskStatusCell status={status}/>}

                    {taskInfo.task_project ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ColorIcon name={taskInfo.task_project.project_uuid} size="xs"/>
                            <span className="truncate max-w-[80px]">{taskInfo.task_project.project_name}</span>
                        </div>
                    ) : (
                        taskInfo.task_assignee && <TaskAssigneeCell userInfo={taskInfo.task_assignee}/>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground ml-auto">
                        {!isZeroEpoch(taskInfo.task_due_date) && (
                            <span className={cn(
                                dd < new Date() && !isCompleted ? "text-destructive" : ""
                            )}>
                                {format(dd, "dd MMM")}
                            </span>
                        )}
                        {taskInfo.task_comment_count > 0 && (
                            <span className="flex items-center gap-0.5">
                                {taskInfo.task_comment_count}
                                <MessageSquare className="h-3 w-3"/>
                            </span>
                        )}
                        {taskInfo.task_sub_task_count > 0 && (
                            <span className="flex items-center gap-0.5">
                                {taskInfo.task_sub_task_count}
                                <GitBranch className="h-3 w-3"/>
                            </span>
                        )}
                        <GitHubBadgeGroup task={taskInfo} size="sm" />
                    </div>
                </div>
            </Link>

        </div>
    )
}
