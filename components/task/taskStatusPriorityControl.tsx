"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {priorities, prioritiesInterface} from "@/types/table";
import { BUILT_IN_STATUSES, type StatusOption } from "@/lib/taskStatus";
import {TaskStatusCell} from "@/components/task/taskStatusCell";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";

type StatusPriorityControlsProps = {
    isAdmin: boolean

    selectedStatus?: StatusOption
    selectedPriority?: prioritiesInterface
    /** The project's statuses, built-in and its own; the built-in ones if left out. */
    statusOptions?: StatusOption[]
    onSelectStatus: (value: string) => void
    onSelectPriority: (value: string) => void
}

export function TaskStatusPriorityControl({
                                           isAdmin,

                                           selectedStatus,
                                           selectedPriority,
                                           statusOptions = BUILT_IN_STATUSES,
                                           onSelectStatus,
                                           onSelectPriority,
                                       }: StatusPriorityControlsProps) {
    const { t } = useTranslation()
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
                                        <>+ {t("setStatus")}</>
                                    )}
                                </Button>
                            </TooltipTrigger>
                        </PopoverTrigger>
                        <TooltipContent>
                            <p>{t("taskStatus")}</p>
                        </TooltipContent>
                    </Tooltip>

                    <PopoverContent className="p-0" side="right" align="start">
                        <Command>
                            <CommandInput placeholder={t("changeStatusPlaceHolder")} />
                            <CommandList>
                                <CommandEmpty>{t("noResultFound")}</CommandEmpty>
                                <CommandGroup>
                                    {statusOptions.map((status) => (
                                        <CommandItem
                                            key={status.value}
                                            // Searched by what people read. The value is taken
                                            // from the option itself: cmdk may lowercase the
                                            // one it hands back, and "inprogress" is no status.
                                            value={`${status.label} ${status.value}`}
                                            onSelect={() => {
                                                setOpenStatus(false)
                                                onSelectStatus(status.value)
                                            }}
                                            className={status.custom ? "pl-6" : undefined}
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
                                        <>+ {t("setPriority")}</>
                                    )}
                                </Button>
                            </TooltipTrigger>
                        </PopoverTrigger>
                        <TooltipContent>
                            <p>{t("taskPriority")}</p>
                        </TooltipContent>
                    </Tooltip>

                    <PopoverContent className="p-0" side="right" align="start">
                        <Command>
                            <CommandInput placeholder={t("changePriority")} />
                            <CommandList>
                                <CommandEmpty>{t("noResultFound")}</CommandEmpty>
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
