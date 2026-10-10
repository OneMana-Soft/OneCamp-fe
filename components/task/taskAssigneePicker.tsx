"use client"

import { displayNameOf, personKeywords } from "@/lib/personName"
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
import { fieldLabel, fieldRow, inlineAffordance, inlineValue } from "@/lib/ui/fieldRow"
import { BotTag } from "@/components/ui/botTag"


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
        <div className={fieldRow()}>
            <div>
                <span className={fieldLabel}>{label}</span>
            </div>
            <div className="min-w-0">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            role="combobox"
                            aria-expanded={open}
                            aria-label={assignee ? `${label}: ${displayNameOf(assignee)}` : `${label}: nobody`}
                            className={cn(inlineValue, "max-w-[240px]")}
                            disabled={!isAdmin}
                        >
                            {assignee && <DesktopNavigationChatAvatar userInfo={assignee}/>}
                            <span className={cn("truncate", !assignee && "text-muted-foreground")}>
                                {assignee ? displayNameOf(assignee) : isAdmin ? "Assign someone" : "Nobody"}
                            </span>
                            <ChevronsUpDown className={cn(inlineAffordance, "h-3.5 w-3.5")} aria-hidden />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[240px] overflow-hidden p-0" align="start">
                        <Command className="bg-popover">
                            <CommandInput placeholder="Search member…" className="h-9 border-none focus:ring-0 shadow-none"/>
                            <CommandList className="max-h-[200px] overflow-y-auto">
                                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No member found.</CommandEmpty>
                                <CommandGroup>
                                    {members.map((member) => (
                                        <CommandItem
                                            key={member.user_uuid}
                                            value={member.user_uuid}
                                            keywords={personKeywords(member)}
                                            onSelect={handleSelect}
                                            className="cursor-pointer gap-2"
                                        >
                                            <DesktopNavigationChatAvatar userInfo={member}/>
                                            <span className="flex-1 truncate">{displayNameOf(member)}</span>
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
                                                keywords={personKeywords(member, ["ai"])}
                                                onSelect={handleSelect}
                                                className="cursor-pointer gap-2"
                                            >
                                                <DesktopNavigationChatAvatar userInfo={member}/>
                                                <span className="flex-1 truncate">{displayNameOf(member)}</span>
                                                <BotTag userUUID={member.user_uuid} />
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
