"use client"

import React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Plus, CheckCircle2, ChevronRight, Link2, Download } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn"
import { statusColors } from "@/lib/colors"
import { DateField } from "./taskDateField"
import ResizeableTextInput from "@/components/resizeableTextInput/resizeableTextInput"
import type {UserProfileDataInterface, UserProfileInterface} from "@/types/user"
import TaskSubTaskAssignee from "@/components/task/taskSubTaskAssignee";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {NewSubTaskDraft, TaskInfoInterface} from "@/types/task";
import {useAnimationState} from "@/hooks/useAnimationState";






type SubtasksSectionProps = {
    isAdmin: boolean
    subtasks: TaskInfoInterface[]
    projectMembers: UserProfileDataInterface[]
    onToggleStatus: (task_uuid: string, newStatus: "done" | "todo") => void
    onRename: (task_uuid: string, name: string) => void
    onUpdateStart: (task_uuid: string, date?: Date) => void
    onUpdateDue: (task_uuid: string, date?: Date) => void
    onUpdateAssignee: (task_uuid: string, userInfo?: UserProfileDataInterface) => void
    onOpen: (task_uuid: string) => void
    onCreateSubtask: (subtaskData: NewSubTaskDraft) => void
}

export function SubtasksSection({
    isAdmin,
    subtasks,
    projectMembers,
    onToggleStatus,
    onRename,
    onUpdateStart,
    onUpdateDue,
    onUpdateAssignee,
    onOpen,
    onCreateSubtask,
}: SubtasksSectionProps) {
    const [isCreatingSubtask, setIsCreatingSubtask] = useState(false)
    const [newSubtask, setNewSubtask] = useState<NewSubTaskDraft>({
        task_name: "",
        task_assignee_uuid: "",
        task_due_date: undefined,
        task_start_date: undefined,
        task_assignee: undefined,
    })
    const { animatingSubtasks, triggerAnimation } = useAnimationState()
    const subtaskFormRef = useRef<HTMLDivElement>(null)

    // Handle clicks outside the subtask creation form
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isCreatingSubtask && subtaskFormRef.current && !subtaskFormRef.current.contains(event.target as Node)) {
                setIsCreatingSubtask(false)
                setNewSubtask({
                    task_name: "",
                    task_assignee_uuid: "",
                    task_due_date: undefined,
                    task_start_date: undefined,
                    task_assignee: undefined,
                })
            }
        }

        if (isCreatingSubtask) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isCreatingSubtask])

    const handleToggleStatusWithAnimation = useCallback((task_uuid: string, newStatus: "done" | "todo") => {
        try {
            if (newStatus === "done") {
                triggerAnimation(task_uuid)
            }
            
            onToggleStatus(task_uuid, newStatus)
        } catch (error) {
            console.error('Error handling subtask status toggle:', error)
            // Fallback to direct toggle without animation
            onToggleStatus(task_uuid, newStatus)
        }
    }, [onToggleStatus, triggerAnimation])

    const handleCreateSubtask = () => {
        if (newSubtask.task_name.trim()) {
            onCreateSubtask(newSubtask)
            setNewSubtask({
                task_name: "",
                task_assignee_uuid: "",
                task_due_date: undefined,
                task_start_date: undefined,
                task_assignee: undefined,
            })
            setIsCreatingSubtask(false)
        }
    }

    const handleCancelCreate = () => {
        setNewSubtask({
            task_name: "",
            task_assignee_uuid: "",
            task_due_date: undefined,
            task_start_date: undefined,
            task_assignee: undefined,
        })
        setIsCreatingSubtask(false)
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Subtasks</Label>
            </div>

            {/* Subtasks List */}
            <div className="">
                {subtasks.map((subtask, index) => (
                    <div key={subtask.task_uuid}>
                        <SubtaskItem
                            subtask={subtask}
                            isAdmin={isAdmin}
                            projectMembers={projectMembers}
                            onToggleStatus={handleToggleStatusWithAnimation}
                            onRename={onRename}
                            onUpdateStart={onUpdateStart}
                            onUpdateDue={onUpdateDue}
                            onUpdateAssignee={onUpdateAssignee}
                            onOpen={onOpen}
                            isAnimating={animatingSubtasks.has(subtask.task_uuid)}
                        />
                        {index < subtasks.length - 1 && (
                            <Separator className="my-0" />
                        )}
                    </div>
                ))}

                {/* Create New Subtask */}
                {isCreatingSubtask && (
                    <div ref={subtaskFormRef} className="bg-muted/30 rounded-lg p-2 border border-dashed">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                                </div>
                                <ResizeableTextInput
                                    delay={0}
                                    content={newSubtask.task_name}
                                    textUpdate={(name) => setNewSubtask(prev => ({ ...prev, task_name: name }))}
                                    textUpdateOnEnter={handleCreateSubtask}
                                    placeholder="Enter subtask name..."
                                    className="flex-1 !px-1 !pt-0.5"
                                />

                            {newSubtask.task_name.trim() && (
                                <div className="flex items-center gap-4">
                                    <DateField
                                        isAdmin={isAdmin}
                                        label="Start"
                                        value={newSubtask.task_start_date}
                                        onSelect={(date) => setNewSubtask(prev => ({ ...prev, task_start_date: date }))}
                                        onClear={() => setNewSubtask(prev => ({ ...prev, task_start_date: undefined }))}
                                        compact
                                    />
                                    <DateField
                                        isAdmin={isAdmin}
                                        label="Due"
                                        value={newSubtask.task_due_date}
                                        onSelect={(date) => setNewSubtask(prev => ({ ...prev, task_due_date: date }))}
                                        onClear={() => setNewSubtask(prev => ({ ...prev, task_due_date: undefined }))}
                                        compact
                                    />
                                    <TaskSubTaskAssignee
                                        taskProjectMembers={projectMembers}
                                        assigneeUpdate={(user) => setNewSubtask(prev => ({ ...prev, task_assignee: user }))}
                                        userProfile={newSubtask.task_assignee}
                                    />
                                </div>
                            )}
                            </div>


                            <div className="flex items-center gap-2 ml-8">
                                <Button
                                    size="sm"
                                    onClick={handleCreateSubtask}
                                    disabled={!newSubtask.task_name.trim()}
                                >
                                    Create
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelCreate}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Subtask Button */}

                <Button
                    variant="ghost"
                    className=" border border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 hover:cursor-pointer"
                    onClick={() => setIsCreatingSubtask(!isCreatingSubtask)}
                    disabled={!isAdmin}
                    size="sm" asChild
                >
                    <div className=' className="flex items-center gap-1"'>
                        <Plus className="w-4 h-4 " />
                        <span>Add subtask</span>
                    </div>

                </Button>

        </div>
    )
}

type SubtaskItemProps = {
    subtask: TaskInfoInterface
    isAdmin: boolean
    projectMembers: UserProfileDataInterface[]
    onToggleStatus: (task_uuid: string, newStatus: "done" | "todo") => void
    onRename: (task_uuid: string, name: string) => void
    onUpdateStart: (task_uuid: string, date?: Date) => void
    onUpdateDue: (task_uuid: string, date?: Date) => void
    onUpdateAssignee: (task_uuid: string, userInfo?: UserProfileDataInterface) => void
    onOpen: (task_uuid: string) => void
    isAnimating: boolean
}

const SubtaskItem = React.memo(function SubtaskItem({
    subtask,
    isAdmin,
    projectMembers,
    onToggleStatus,
    onRename,
    onUpdateStart,
    onUpdateDue,
    onUpdateAssignee,
    onOpen,
    isAnimating,
}: SubtaskItemProps) {
    const isCompleted = subtask.task_status === "done"
    const startDate = subtask.task_start_date && !isZeroEpoch(subtask.task_start_date)? new Date(subtask.task_start_date) : undefined
    const dueDate = subtask.task_due_date && !isZeroEpoch(subtask.task_due_date)? new Date(subtask.task_due_date) : undefined
    const hasComments = (subtask.task_comment_count || 0) > 0
    const hasSubtasks = (subtask.task_sub_task_count || 0) > 0


    const handleToggleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onToggleStatus(subtask.task_uuid, isCompleted ? "todo" : "done")
    }, [onToggleStatus, subtask.task_uuid, isCompleted])

    const handleOpenClick = useCallback(() => {
        onOpen(subtask.task_uuid)
    }, [onOpen, subtask.task_uuid])

    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-x-1 gap-y-1.5 p-1 py-1 rounded-lg hover:bg-primary/5",
                isCompleted && "bg-primary/5",
                isAnimating && "animate-gradient-completion"
            )}
        >
            {/* Completion Status */}
            <div className="flex-shrink-0">
                <button
                    onClick={handleToggleClick}
                    className="flex items-center justify-center"
                    aria-label={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                    type="button"
                >
                    {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 statusColors.success.text" />
                    ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/50" />
                    )}
                </button>
            </div>

            {/* Task Name — fills the first row */}
            <div className="flex-1 min-w-0 basis-[60%] sm:basis-auto">
                <div className="flex items-center gap-2 min-w-0">
                    {isAdmin ? (
                        <ResizeableTextInput
                            delay={500}
                            content={subtask.task_name}
                            textUpdate={(s: string) => onRename(subtask.task_uuid, s)}
                            textUpdateOnEnter={(s: string) => onRename(subtask.task_uuid, s)}
                            placeholder="Enter subtask name..."
                            className='!text-sm font-medium truncate !px-1 !pt-0.5'
                        />
                    ) : (
                        <span className={cn("text-sm font-medium truncate")}>{subtask.task_name}</span>
                    )}


                    {/* Comments and Subtasks Count */}
                    {(hasComments || hasSubtasks) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            {hasComments && (
                                <span>{subtask.task_comment_count}</span>
                            )}
                            {hasSubtasks && (
                                <>
                                    {hasComments && <span>•</span>}
                                    <Link2 className="w-3 h-3" />
                                    <span>{subtask.task_sub_task_count}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/*
              Meta cluster (dates + assignee + open arrow).
              On mobile this wraps onto a second row beneath the name so
              long subtask titles don't squeeze the dates off-screen.
              `ml-auto` keeps the cluster right-aligned on its row.
            */}
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto basis-full sm:basis-auto justify-end pl-7 sm:pl-0">
                {/* Dates */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    <DateField
                        isAdmin={isAdmin}
                        label={("Start")}
                        value={startDate}
                        onSelect={(d) => onUpdateStart(subtask.task_uuid, d)}
                        onClear={() => onUpdateStart(subtask.task_uuid, undefined)}
                        compact
                    />
                    <DateField
                        isAdmin={isAdmin}
                        label="Due"
                        value={dueDate}
                        onSelect={(d) => onUpdateDue(subtask.task_uuid, d)}
                        onClear={() => onUpdateDue(subtask.task_uuid, undefined)}
                        compact
                    />
                </div>

                {/* Assignee */}
                <div className="flex-shrink-0">
                    <TaskSubTaskAssignee
                        taskProjectMembers={projectMembers}
                        userProfile={subtask.task_assignee}
                        assigneeUpdate={(u) => onUpdateAssignee(subtask.task_uuid, u)}
                    />
                </div>

                {/* Navigation Arrow */}
                <div className="flex-shrink-0" onClick={handleOpenClick}>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
            </div>
        </div>
    )
})
