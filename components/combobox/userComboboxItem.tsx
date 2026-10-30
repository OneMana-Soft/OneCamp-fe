"use client"

import { ComboboxItem } from "@/components/ui/combobox"
import { BotTag } from "@/components/ui/botTag"
import { ChatFace } from "@/components/message/chatFace"
import { useBotKind } from "@/hooks/useBotKinds"
import { botSubtitle } from "@/lib/botCopy"
import { addressOrHandleOf, personSearchValue } from "@/lib/personName"

interface UserComboboxItemProps {
    userUuid: string
    userName: string
    userFullName?: string
    userHandle?: string
    userEmail?: string
    userProfileObjectKey?: string
    isSelected: boolean
    isBot?: boolean
    onSelect: (value: string) => void
}

/** A person in a picker: their face (ChatFace), name and address or handle, searched by all; the check ends the row. */
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
    const botKind = useBotKind(userUuid, isBot)
    const secondLine = isBot ? botSubtitle(botKind) : addressOrHandleOf({ user_email_id: userEmail, user_handle: userHandle })

    return (
        <ComboboxItem
            value={userUuid}
            keywords={[personSearchValue(userName, { fullName: userFullName, handle: userHandle, email: userEmail })]}
            checked={isSelected}
            checkAt="end"
            onSelect={() => onSelect(userUuid)}
            className="gap-3 py-1.5"
        >
            <ChatFace name={userName} profileKey={userProfileObjectKey} userUUID={userUuid} isBot={isBot} size={28} />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate font-medium">
                    {userName}
                    {isBot && (
                        <BotTag userUUID={userUuid} />
                    )}
                </span>
                {secondLine && <span className="truncate text-2xs text-ink-3">{secondLine}</span>}
            </div>
        </ComboboxItem>
    )
}
