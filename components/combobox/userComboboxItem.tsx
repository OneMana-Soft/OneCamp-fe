"use client"

import { Check } from "lucide-react"
import { CommandItem } from "@/components/ui/command"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils/helpers/cn"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { useMediaFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { GetMediaURLRes } from "@/types/file"

interface UserComboboxItemProps {
    userUuid: string
    userName: string
    userEmail?: string
    userProfileObjectKey?: string
    isSelected: boolean
    onSelect: (value: string) => void
}

export function UserComboboxItem({
    userUuid,
    userName,
    userEmail,
    userProfileObjectKey,
    isSelected,
    onSelect,
}: UserComboboxItemProps) {
    const profileImageRes = useMediaFetch<GetMediaURLRes>(
        userProfileObjectKey ? `${GetEndpointUrl.PublicAttachmentURL}/${userProfileObjectKey}` : ""
    )

    return (
        <CommandItem
            value={userUuid}
            onSelect={(currentValue) => onSelect(currentValue)}
            className="cursor-pointer p-2 rounded-lg m-1 gap-3 aria-selected:bg-primary/5 transition-colors duration-200"
        >
            <Avatar className="h-8 w-8 border border-border/50 flex-shrink-0">
                <AvatarImage
                    src={profileImageRes.data?.url || ""}
                    alt={userName}
                />
                <AvatarFallback className="text-[10px] font-bold bg-primary/5 text-primary">
                    {getNameInitials(userName)}
                </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
                <span className="font-semibold text-sm truncate">{userName}</span>
                <span className="text-[10px] text-muted-foreground truncate font-medium">{userEmail}</span>
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
