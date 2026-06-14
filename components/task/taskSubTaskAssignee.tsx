import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check } from "@/lib/icons";
import { UserCircle } from "lucide-react";
import { cn } from "@/lib/utils/helpers/cn"
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {UserProfileDataInterface} from "@/types/user";
import {useUserAvatar} from "@/hooks/useUserAvatar";

interface SubTaskAssigneeProps {
    userProfile?: UserProfileDataInterface
    taskProjectMembers?: UserProfileDataInterface[]
    assigneeUpdate: (u: UserProfileDataInterface | undefined) => void
}

export default function TaskSubTaskAssignee({ userProfile, assigneeUpdate, taskProjectMembers }: SubTaskAssigneeProps) {
    const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false)


    const {src: imageSrc} = useUserAvatar(userProfile?.user_profile_object_key);

    const nameInitialArray = userProfile?.user_name.split(' ') || ["Unknown"]

    return (
        <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-expanded={assigneePopoverOpen}
                            className="rounded-full !p-0 h-10 w-10 flex items-center justify-center"
                        >
                            {userProfile ? (
                                <Avatar className="h-8 w-8">
                                    <AvatarImage
                                        src={imageSrc}
                                        alt="Profile icon"
                                    />
                                    <AvatarFallback>
                                        {nameInitialArray[0][0].toUpperCase() +
                                            (nameInitialArray.length > 1 ? nameInitialArray[1][0].toUpperCase() : '')}
                                    </AvatarFallback>
                                </Avatar>
                            ) : (
                                <UserCircle className="p-0 text-muted-foreground" />
                            )}
                        </Button>
                    </PopoverTrigger>

                </TooltipTrigger>
                <TooltipContent>
                    <p>{('assignee')}</p>
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder={('searchMemberPlaceholder')}/>
                    <CommandList>
                        <CommandEmpty>{('noMemberFound')}</CommandEmpty>
                        <CommandGroup>
                            {taskProjectMembers?.map((member: UserProfileDataInterface) => (
                                <CommandItem
                                    key={member.user_uuid}
                                    value={member.user_uuid}
                                    keywords={member.user_name ? [member.user_name] : undefined}
                                    onSelect={(currentValue) => {
                                        const m = taskProjectMembers.find((m) => m.user_uuid === currentValue);

                                        const selectedTaskAssignee = currentValue === userProfile?.user_uuid ? undefined : m
                                        assigneeUpdate(selectedTaskAssignee)
                                        setAssigneePopoverOpen(false)
                                    }}
                                >
                                    <span>{member.user_name}</span>
                                    <Check
                                        className={cn(
                                            "ml-auto",
                                            userProfile?.user_uuid === member.user_uuid ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}