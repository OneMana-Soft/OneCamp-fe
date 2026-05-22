"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"
import {priorities, prioritiesInterface, taskStatuses} from "@/types/table";
import {TaskStatusCell} from "@/components/task/taskStatusCell";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";

export type Option = {
    value: string
    label: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

type StatusPriorityControlsProps = {
    isAdmin: boolean

    selectedStatus?: prioritiesInterface
    selectedPriority?: prioritiesInterface
    onSelectStatus: (value: string) => void
    onSelectPriority: (value: string) => void
}

export function TaskStatusPriorityControl({
                                           isAdmin,

                                           selectedStatus,
                                           selectedPriority,
                                           onSelectStatus,
                                           onSelectPriority,
                                       }: StatusPriorityControlsProps) {
    const [openStatus, setOpenStatus] = React.useState(false)
    const [openPriority, setOpenPriority] = React.useState(false)

    return (
            <div className="flex flex-wrap gap-2 mb-6 -ml-2">
                <Popover open={openStatus} onOpenChange={setOpenStatus} >
                    <Tooltip>
                        <PopoverTrigger asChild>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="px-0 py-0 justify-start bg-transparent" disabled={!isAdmin}>
                                    {selectedStatus ? (
                                        <>
                                            <TaskStatusCell  status={selectedStatus} />

                                        </>
                                    ) : (
                                        <>+ {("setStatus")}</>
                                    )}
                                </Button>
                            </TooltipTrigger>
                        </PopoverTrigger>
                        <TooltipContent>
                            <p>{("taskStatus")}</p>
                        </TooltipContent>
                    </Tooltip>

                    <PopoverContent className="p-0" side="right" align="start">
                        <Command>
                            <CommandInput placeholder={("changeStatusPlaceHolder")} />
                            <CommandList>
                                <CommandEmpty>{("noResultFound")}</CommandEmpty>
                                <CommandGroup>
                                    {taskStatuses.map((status) => (
                                        <CommandItem
                                            key={status.value}
                                            value={status.value}
                                            onSelect={(value) => {
                                                setOpenStatus(false)
                                                onSelectStatus(value)
                                            }}
                                        >
                                            <TaskStatusCell  status={status} />

                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                <Popover open={openPriority} onOpenChange={setOpenPriority}>
                    <Tooltip>
                        <PopoverTrigger asChild>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="px-0 py-0 justify-start bg-transparent" disabled={!isAdmin}>
                                    {selectedPriority ? (
                                        <>
                                            <TaskPriorityCell priority={selectedPriority} />

                                        </>
                                    ) : (
                                        <>+ {("setPriority")}</>
                                    )}
                                </Button>
                            </TooltipTrigger>
                        </PopoverTrigger>
                        <TooltipContent>
                            <p>{("taskPriority")}</p>
                        </TooltipContent>
                    </Tooltip>

                    <PopoverContent className="p-0" side="right" align="start">
                        <Command>
                            <CommandInput placeholder={("changePriority")} />
                            <CommandList>
                                <CommandEmpty>{("noResultFound")}</CommandEmpty>
                                <CommandGroup>
                                    {priorities.map((p) => (
                                        <CommandItem
                                            key={p.value}
                                            value={p.value}
                                            onSelect={(value) => {
                                                setOpenPriority(false)
                                                onSelectPriority(value)
                                            }}
                                        >
                                            <TaskPriorityCell priority={p} />

                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
    )
}
