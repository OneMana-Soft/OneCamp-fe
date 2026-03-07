import {TaskInfoInterface} from "@/types/task";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";
import {priorities, prioritiesInterface, taskStatuses} from "@/types/table";
import {TaskStatusCell} from "@/components/task/taskStatusCell";
import {TaskAssigneeCell} from "@/components/task/taskAssigneeCell";
import {ColorIcon} from "@/components/colorIcon/colorIcon";
import {Badge} from "@/components/ui/badge";
import { CheckCircle2, GitBranch, MessageSquare} from "lucide-react";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {format} from "date-fns";
import { app_task_path} from "@/types/paths";
import Link from "next/link";
import React, {useCallback} from "react";
import {cn} from "@/lib/utils/helpers/cn";

export const TaskListTask = ({taskInfo, onToggleStatus, isAdmin, isAnimating}:{taskInfo: TaskInfoInterface,onToggleStatus: (task_uuid: string, projectId: string, newStatus: "done" | "todo") => void , isAdmin: boolean, isAnimating: boolean}) => {

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

    },[onToggleStatus])
    const priority = priorities.find(
        (priority: prioritiesInterface) => priority.value === taskInfo.task_priority
    );

    const status = taskStatuses.find(
        (status: prioritiesInterface) => status.value === taskInfo.task_status
    );

    return (
        <div className={cn("flex p-4 border-1  border-primary/50 bg-muted/30 shadow-md justify-center items-start rounded-2xl h-44", isAnimating && "animate-gradient-completion")} >
            <div className=' w-8 mt-1'>
                <button
                    onClick={handleDoneClick}
                    className="flex items-center justify-center"
                    aria-label={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                    type="button"
                    disabled={!isAdmin}
                >
                    {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500"/>
                    ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/50"/>
                    )}
                </button>

            </div>
            <Link href={taskHref} className='flex-col space-y-3 flex-1'>
                <div className="max-w-[60vw] flex items-center mb-2 ">
                    {taskInfo.task_label && <Badge variant="secondary">{taskInfo.task_label}</Badge>}
                    <div className=' text-ellipsis truncate'>{taskInfo.task_name}</div>

                </div>
                <div className='flex justify-between'>
                    <div className='flex space-x-2'>
                        {priority && <TaskPriorityCell priority={priority}/>}
                        {status && <TaskStatusCell status={status}/>}
                    </div>
                    {
                        taskInfo.task_project ?
                            <div className='flex justify-center items-center gap-x-1 text-sm max-w-20'>
                                <ColorIcon name={taskInfo.task_project.project_uuid} size={'xs'}/>
                                <div className='truncate text-ellipsis flex-1 min-w-0'>
                                    {taskInfo.task_project.project_name} {/* Remove the duplicate if unintentional */}
                                </div>
                            </div>
                            :
                            (taskInfo.task_assignee && <TaskAssigneeCell userInfo={taskInfo.task_assignee}/>)
                    }
                </div>
                <div className='capitalize space-y-1'>
                    <div className='flex justify-between'>
                        <div className='flex space-x-2 text-xs text-muted-foreground'>
                            <div>start date</div>
                            <div>{!isZeroEpoch(taskInfo.task_start_date) ? format(sd, "dd MMM yyyy") : "--"}</div>
                        </div>
                        <div className='flex space-x-2 text-xs text-muted-foreground'>
                            <div>Created date</div>
                            <div>{!isZeroEpoch(taskInfo.task_created_at) ? format(cd, "dd MMM yyyy") : "--"}</div>
                        </div>
                    </div>
                    <div className='flex space-x-2 text-xs text-muted-foreground'>
                        <div>due date</div>
                        <div>{!isZeroEpoch(taskInfo.task_due_date) ? format(dd, "dd MMM yyyy") : "--"}</div>
                    </div>
                </div>
                <div className='flex space-x-4 text-sm px-1'>
                    {taskInfo.task_comment_count &&
                        <span className='text-muted-foreground '>{taskInfo.task_comment_count}<MessageSquare
                            className='h-3 w-3 inline ml-1'/></span>}
                    {taskInfo.task_sub_task_count &&
                        <span className='text-muted-foreground '>{taskInfo.task_sub_task_count}<GitBranch
                            className='h-3 w-3 inline ml-1'/></span>}

                </div>
            </Link>

        </div>
    )
}