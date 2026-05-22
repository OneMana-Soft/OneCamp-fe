"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { ChevronRight, X } from "@/lib/icons";
import { CircleCheck, Calendar as CalIcon } from "lucide-react";
import { cn } from "@/lib/utils/helpers/cn"
import { statusColors } from "@/lib/colors"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import ResizeableTextInput from "@/components/resizeableTextInput/resizeableTextInput"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type SubTask = {
    task_uuid: string
    task_name: string
    task_status: string
    task_start_date?: string
    task_due_date?: string
    task_assignee?: { user_uuid: string }
}

type SubtaskItemProps = {
    isAdmin: boolean
    subTask: SubTask
    onToggleStatus: (task_uuid: string, newStatus: "done" | "todo") => void
    onRename: (task_uuid: string, name: string) => void
    onUpdateStart: (task_uuid: string, date?: Date) => void
    onUpdateDue: (task_uuid: string, date?: Date) => void
    onOpen: (task_uuid: string) => void
    AssigneeControl: React.ReactNode
}

export function TaskSubtaskItem({
                                isAdmin,
                                subTask,
                                onToggleStatus,
                                onRename,
                                onUpdateStart,
                                onUpdateDue,
                                onOpen,
                                AssigneeControl,
                            }: SubtaskItemProps) {
    const parseSafeDate = (d?: string) => {
        if (!d) return undefined;
        try {
            const date = new Date(d);
            return isNaN(date.getTime()) ? undefined : date;
        } catch {
            return undefined;
        }
    }
    const startDate = parseSafeDate(subTask.task_start_date)
    const dueDate = parseSafeDate(subTask.task_due_date)

    return (
            <div className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-4 flex-1">
                    <CircleCheck
                        className={"w-5 h-5 hover:cursor-pointer " + (subTask.task_status === "done" ? "statusColors.success.text" : "")}
                        onClick={() => onToggleStatus(subTask.task_uuid, subTask.task_status === "done" ? "todo" : "done")}
                    />
                    <ResizeableTextInput
                        delay={1500}
                        content={subTask.task_name}
                        textUpdate={(s: string) => onRename(subTask.task_uuid, s)}
                        textUpdateOnEnter={(s: string) => onRename(subTask.task_uuid, s)}
                        placeholder="Enter sub task name..."
                    />
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative w-fit">
                        <Popover>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn("ml-2 text-left font-normal", !startDate && "text-muted-foreground")}
                                            disabled={!isAdmin}
                                        >
                                            {startDate && format(startDate, "dd MMM")}
                                            <CalIcon className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Start date</p>
                                </TooltipContent>
                            </Tooltip>

                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={startDate} onSelect={(d) => onUpdateStart(subTask.task_uuid, d)} />
                            </PopoverContent>
                        </Popover>
                        {startDate && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -right-4 -top-4 transform rounded-full decoration-0 p-0 hover:bg-transparent"
                                onClick={() => onUpdateStart(subTask.task_uuid, undefined)}
                                disabled={!isAdmin}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                    <div className="relative w-fit">
                        <Popover>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn("text-left font-normal", !dueDate && "text-muted-foreground")}
                                            disabled={!isAdmin}
                                        >
                                            {dueDate && format(dueDate, "dd MMM")}
                                            <CalIcon className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Due date</p>
                                </TooltipContent>
                            </Tooltip>

                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={dueDate} onSelect={(d) => onUpdateDue(subTask.task_uuid, d)} />
                            </PopoverContent>
                        </Popover>
                        {dueDate && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -right-4 -top-4 transform rounded-full decoration-0 p-0 hover:bg-transparent"
                                onClick={() => onUpdateDue(subTask.task_uuid, undefined)}
                                disabled={!isAdmin}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>

                    {AssigneeControl}
                    <Button variant="ghost" size="icon" onClick={() => onOpen(subTask.task_uuid)}>
                        <ChevronRight className="w-5 h-5" />
                    </Button>
                </div>
            </div>
    )
}
