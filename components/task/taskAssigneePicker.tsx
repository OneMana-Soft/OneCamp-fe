"use client"

import { displayNameOf, personKeywords } from "@/lib/personName"
import React from "react"
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxField,
    ComboboxGroup,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox"
import {UserProfileDataInterface} from "@/types/user";
import {DesktopNavigationChatAvatar} from "@/components/navigationBar/desktop/desktopNavigationChatAvatar";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import { propertyLabel, propertyRow, propertyValue } from "@/lib/ui/propertyRow"
import { cn } from "@/lib/utils/helpers/cn"
import { BotTag } from "@/components/ui/botTag"
import { NobodyMark } from "@/components/ui/graphics/NobodyMark"


/** The row that takes the assignee off. */
const NOBODY = "__nobody__"

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
    // DM-able AI teammates (per-agent bot principals), badged AI. Empty when AI
    // is off or none are DM-able, so there is no dangling affordance. Fetched
    // only when opted in.
    const aiTargets = useFetch<{ data: UserProfileDataInterface[] }>(
        includeAITeammates ? GetEndpointUrl.GetDMableAITargets : ''
    )
    const aiTeammates = (includeAITeammates && aiTargets.data?.data) || []

    const resolve = (uuid: string): UserProfileDataInterface | undefined =>
        members.find((m) => m.user_uuid === uuid) || aiTeammates.find((m) => m.user_uuid === uuid)

    // No one takes the assignee off; the assignee chosen again stays.
    const handleSelect = (uuid: string) => {
        if (uuid === NOBODY) {
            if (assignee) onChange(undefined)
        } else if (uuid !== assignee?.user_uuid) onChange(resolve(uuid))
    }

    const row = (member: UserProfileDataInterface, ai: boolean) => (
        <ComboboxItem
            key={member.user_uuid}
            value={member.user_uuid}
            keywords={personKeywords(member, ai ? ["ai"] : [])}
            checked={assignee?.user_uuid === member.user_uuid}
            onSelect={handleSelect}
        >
            <DesktopNavigationChatAvatar userInfo={member}/>
            <span className="min-w-0 flex-1 truncate">{displayNameOf(member)}</span>
            {ai && <BotTag userUUID={member.user_uuid} />}
        </ComboboxItem>
    )

    return (
        <div className={propertyRow()} data-field-empty={assignee ? undefined : ""}>
            <div>
                <span className={propertyLabel}>{label}</span>
            </div>
            <div className="min-w-0">
                {isAdmin ? (
                    <Combobox>
                        <ComboboxField
                            variant="inline"
                            aria-label={assignee ? `${label}: ${displayNameOf(assignee)}` : `${label}: nobody`}
                            // The values' ink and weight: a ghost button's muted ink is a step lighter (DESIGN-BUILD-13).
                            className="max-w-[240px] font-[450] text-foreground"
                            icon={assignee ? <DesktopNavigationChatAvatar userInfo={assignee}/> : undefined}
                            placeholder="Assign someone"
                        >
                            {assignee ? displayNameOf(assignee) : undefined}
                        </ComboboxField>
                        <ComboboxContent label={label} selected={assignee?.user_uuid ?? NOBODY}>
                            <ComboboxInput placeholder="Find someone…" />
                            <ComboboxList>
                                <ComboboxEmpty>Nobody by that name.</ComboboxEmpty>
                                <ComboboxGroup>
                                    {/* Nobody, as a row to choose (W19's unassigned ghost), checked while no one is. */}
                                    <ComboboxItem value={NOBODY} keywords={["No one", "nobody", "unassign"]} checked={!assignee} onSelect={handleSelect} className="text-muted-foreground">
                                        <NobodyMark className="size-7 md:size-5" />
                                        <span className="min-w-0 flex-1 truncate">No one</span>
                                    </ComboboxItem>
                                    {members.map((member) => row(member, false))}
                                </ComboboxGroup>
                                {aiTeammates.length > 0 && (
                                    <ComboboxGroup heading="AI teammates">{aiTeammates.map((member) => row(member, true))}</ComboboxGroup>
                                )}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>
                ) : (
                    // Read only, the assignee is text at full ink, not a disabled control
                    // drawn at half strength (app/interaction.css).
                    <span className={cn(propertyValue, "max-w-[240px] hover:bg-transparent")}>
                        {assignee && <DesktopNavigationChatAvatar userInfo={assignee}/>}
                        <span className={cn("truncate", !assignee && "text-muted-foreground")}>{assignee ? displayNameOf(assignee) : "Nobody"}</span>
                    </span>
                )}
            </div>
        </div>
    )
}
