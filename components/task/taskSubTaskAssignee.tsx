import { displayNameOf, personKeywords } from "@/lib/personName"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {UserProfileDataInterface} from "@/types/user";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import { MenuCheck, menuCheckState } from "@/components/ui/menuCheck"

interface SubTaskAssigneeProps {
    userProfile?: UserProfileDataInterface
    taskProjectMembers?: UserProfileDataInterface[]
    assigneeUpdate: (u: UserProfileDataInterface | undefined) => void
}

export default function TaskSubTaskAssignee({ userProfile, assigneeUpdate, taskProjectMembers }: SubTaskAssigneeProps) {
    const { t } = useTranslation()
    const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false)


    const {src: imageSrc} = useUserAvatar(userProfile?.user_profile_object_key);


    return (
        <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={userProfile ? `Assigned to ${displayNameOf(userProfile)}. Change` : "Assign this subtask"}
                            aria-expanded={assigneePopoverOpen}
                            className="size-6 rounded-full !p-0"
                        >
                            {userProfile ? (
                                <IdentityMark variant="avatar" id={avatarSeed(userProfile)} label={displayNameOf(userProfile)} src={imageSrc} size={18} />
                            ) : (
                                // Nobody yet: an 18px dashed circle (W19's unassigned ghost).
                                <span aria-hidden className="size-[18px] rounded-full border border-dashed border-line-3" />
                            )}
                        </Button>
                    </PopoverTrigger>

                </TooltipTrigger>
                <TooltipContent>
                    <p>{t('assignee')}</p>
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder={t('searchMemberPlaceholder')}/>
                    <CommandList>
                        <CommandEmpty>{t('noMemberFound')}</CommandEmpty>
                        <CommandGroup>
                            {taskProjectMembers?.map((member: UserProfileDataInterface) => (
                                <CommandItem
                                    key={member.user_uuid}
                                    value={member.user_uuid}
                                    keywords={personKeywords(member)}
                                    onSelect={(currentValue) => {
                                        const m = taskProjectMembers.find((m) => m.user_uuid === currentValue);

                                        const selectedTaskAssignee = currentValue === userProfile?.user_uuid ? undefined : m
                                        assigneeUpdate(selectedTaskAssignee)
                                        setAssigneePopoverOpen(false)
                                    }}
                                    {...menuCheckState(userProfile?.user_uuid === member.user_uuid)}
                                >
                                    <span>{displayNameOf(member)}</span>
                                    <MenuCheck checked={userProfile?.user_uuid === member.user_uuid} className="ml-auto" />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}