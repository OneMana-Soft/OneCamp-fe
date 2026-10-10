"use client"

import { Check } from "@/lib/icons";
import { CommandItem } from "@/components/ui/command"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BotTag } from "@/components/ui/botTag"
import { cn } from "@/lib/utils/helpers/cn"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useBotKind } from "@/hooks/useBotKinds"
import { botSubtitle } from "@/lib/botCopy"
import { addressOrHandleOf, personSearchValue } from "@/lib/personName"

interface UserComboboxItemProps {
    userUuid: string
    userName: string
    /** Matched by the list's search, as is the handle. */
    userFullName?: string
    userHandle?: string
    userEmail?: string
    userProfileObjectKey?: string
    isSelected: boolean
    isBot?: boolean
    onSelect: (value: string) => void
}

export function UserComboboxItem({
    userUuid,
    userName,
    userFullName,
    userHandle,
    userEmail,
    userProfileObjectKey,
    isSelected,
    isBot,
    onSelect,
}: UserComboboxItemProps) {
    const {src: imageSrc} = useUserAvatar(userProfileObjectKey)
    const botKind = useBotKind(userUuid, isBot)
    const secondLine = isBot ? botSubtitle(botKind) : addressOrHandleOf({ user_email_id: userEmail, user_handle: userHandle })

    return (
        <CommandItem
            value={personSearchValue(userName, { fullName: userFullName, handle: userHandle, email: userEmail, id: userUuid })}
            onSelect={() => onSelect(userUuid)}
            className="cursor-pointer p-2 rounded-lg m-1 gap-3 aria-selected:bg-primary/5 transition-colors duration-200"
        >
            <Avatar className="h-8 w-8 border border-border/50 flex-shrink-0">
                <AvatarImage
                    src={imageSrc}
                    alt={userName}
                />
                <AvatarFallback className="text-3xs font-medium">
                    {getNameInitials(userName)}
                </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
                <span className="font-medium text-sm truncate flex items-center gap-1.5">
                    {userName}
                    {isBot && (
                        <BotTag userUUID={userUuid} />
                    )}
                </span>
                {secondLine && <span className="text-2xs text-muted-foreground truncate font-medium">{secondLine}</span>}
            </div>
            <Check
                className={cn(
                    "ml-auto h-4 w-4 text-primary",
                    isSelected ? "opacity-100" : "opacity-0"
                )}
            />
        </CommandItem>
    )
}
