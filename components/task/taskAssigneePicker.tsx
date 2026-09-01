"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { ChevronsUpDown, Check } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn"
import {UserProfileDataInterface} from "@/types/user";
import {DesktopNavigationChatAvatar} from "@/components/navigationBar/desktop/desktopNavigationChatAvatar";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";


type AssigneePickerProps = {
    isAdmin: boolean
    label: string
    members: UserProfileDataInterface[]
    assignee?: UserProfileDataInterface
    onChange: (userInfo: UserProfileDataInterface | undefined) => void
    // includeAITeammates surfaces the workspace's DM-able AI teammates as an
    // assignable group. Assigning a task to one hands the work to that agent
    // (the durable agent-task engine runs it and posts status as comments).
    // Opt-in so only the primary task assignee picker offers it.
    includeAITeammates?: boolean
}

export function TaskAssigneePicker({ isAdmin, label, members, assignee, onChange, includeAITeammates }: AssigneePickerProps) {
    const [open, setOpen] = React.useState(false)

    // DM-able AI teammates (per-agent bot principals), badged AI. Empty when AI
    // is off or none are DM-able, so there is no dangling affordance. Fetched
    // only when opted in.
    const aiTargets = useFetch<{ data: UserProfileDataInterface[] }>(
        includeAITeammates ? GetEndpointUrl.GetDMableAITargets : ''
    )
    const aiTeammates = (includeAITeammates && aiTargets.data?.data) || []

    const resolve = (uuid: string): UserProfileDataInterface | undefined =>
        members.find((m) => m.user_uuid === uuid) || aiTeammates.find((m) => m.user_uuid === uuid)

    const handleSelect = (currentValue: string) => {
        const selected = currentValue === assignee?.user_uuid ? undefined : resolve(currentValue)
        onChange(selected)
        setOpen(false)
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-1 sm:gap-0 sm:items-center mb-2">
            <div className="sm:col-span-1">
                <span className="text-xs capitalize text-muted-foreground sm:text-foreground">{label}</span>
            </div>
            <div className="sm:col-span-5 sm:-ml-0 md:-ml-4 ">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full max-w-[220px] justify-between font-normal h-10 bg-transparent group hover:bg-muted/40 transition-colors duration-150 px-4"
                            disabled={!isAdmin}
                        >
                            <div className='flex text-sm font-medium gap-x-2 items-center truncate'>
                                {assignee && <DesktopNavigationChatAvatar userInfo={assignee}/>}
                                <span className="truncate">{assignee ? assignee.user_name : "Select assignee"}</span>
                            </div>
                            <ChevronsUpDown className="invisible group-hover:visible ml-2 h-4 w-4 shrink-0 opacity-40" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[240px] p-0 shadow-xl border-border/50 rounded-xl overflow-hidden">
                        <Command className="bg-popover">
                            <CommandInput placeholder="Search member..." className="h-9 border-none focus:ring-0 shadow-none"/>
                            <CommandList className="max-h-[200px] overflow-y-auto">
                                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No member found.</CommandEmpty>
                                <CommandGroup>
                                    {members.map((member) => (
                                        <CommandItem
                                            key={member.user_uuid}
                                            value={member.user_uuid}
                                            keywords={member.user_name ? [member.user_name] : undefined}
                                            onSelect={handleSelect}
                                            className="cursor-pointer p-2 rounded-lg m-1 gap-3 aria-selected:bg-primary/5 transition-colors duration-200"
                                        >
                                            <span className="flex-1 font-medium text-sm">{member.user_name}</span>
                                            <Check
                                                className={cn(
                                                    "ml-auto h-4 w-4 text-primary",
                                                    assignee?.user_uuid === member.user_uuid ? "opacity-100" : "opacity-0",
                                                )}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                                {aiTeammates.length > 0 && (
                                    <CommandGroup heading="AI teammates">
                                        {aiTeammates.map((member) => (
                                            <CommandItem
                                                key={member.user_uuid}
                                                value={member.user_uuid}
                                                keywords={member.user_name ? [member.user_name, "ai"] : ["ai"]}
                                                onSelect={handleSelect}
                                                className="cursor-pointer p-2 rounded-lg m-1 gap-3 aria-selected:bg-primary/5 transition-colors duration-200"
                                            >
                                                <span className="flex-1 font-medium text-sm">{member.user_name}</span>
                                                <span className="text-3xs uppercase tracking-wide text-primary/70 border border-primary/30 rounded px-1 py-0.5">AI</span>
                                                <Check
                                                    className={cn(
                                                        "ml-1 h-4 w-4 text-primary",
                                                        assignee?.user_uuid === member.user_uuid ? "opacity-100" : "opacity-0",
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    )
}
