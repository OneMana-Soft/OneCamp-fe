"use client"

import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { ChatFace } from "@/components/message/chatFace"
import { BotTag } from "@/components/ui/botTag"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useBotKind } from "@/hooks/useBotKinds"
import { botSubtitle } from "@/lib/botCopy"
import { MoreHorizontal } from "@/lib/icons"
import type { UserProfileDataInterface } from "@/types/user"

interface MemberRowProps {
    user: UserProfileDataInterface
    /** The reader is an admin of the channel: the row offers its actions. */
    canManage: boolean
    /** The reader themselves: "You", and "Leave" lives in the danger zone instead. */
    isSelf: boolean
    /** The channel's creator: never removed, never demoted. */
    isCreator: boolean
    onMakeAdmin: (id: string) => void
    onRemoveAdmin: (id: string) => void
    onRemove: (id: string) => void
}

/**
 * A channel member (design v3 chat, C50): 48px, a 32px face, the name at
 * 14/510 with its tag, the role as a neutral chip on the right, and one more
 * menu (Make admin, Remove) for an admin. The crown badge on the avatar is
 * gone: a role is a word, not a decoration on someone's face.
 */
export function MemberRow({ user, canManage, isSelf, isCreator, onMakeAdmin, onRemoveAdmin, onRemove }: MemberRowProps) {
    const name = displayNameOf(user)
    const botKind = useBotKind(user.user_uuid, user.is_bot)
    const second = user.is_bot ? botSubtitle(botKind) : addressOrHandleOf(user)
    // Agents are managed in the Agents section; the creator stays as they are.
    const menu = canManage && !user.is_bot && !isCreator && !isSelf
    const role = user.user_is_admin || isCreator ? <span className="chip shrink-0">{isCreator ? "Owner" : "Admin"}</span> : null

    return (
        <div data-member-row="" className="flex min-h-12 items-center gap-3 rounded-lg px-2 transition-colors duration-[140ms] hover:bg-hover">
            <ChatFace name={name} profileKey={user.user_profile_object_key} userUUID={user.user_uuid} isBot={!!user.is_bot} size={32} />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-ui font-medium text-ink">{name}</span>
                    {user.is_bot && <BotTag userUUID={user.user_uuid} />}
                    {isSelf && <span className="text-meta text-ink-3">you</span>}
                </div>
                {second && <p className="truncate text-meta text-ink-3">{second}</p>}
            </div>
            {menu && role}
            {menu ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`} className="shrink-0">
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        {user.user_is_admin ? (
                            <DropdownMenuItem onSelect={() => onRemoveAdmin(user.user_uuid)}>Remove admin role</DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem onSelect={() => onMakeAdmin(user.user_uuid)}>Make admin</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger-ink" onSelect={() => onRemove(user.user_uuid)}>
                            Remove from channel
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                // A row without a menu has its role at the right edge, where
                // the others' "…" ends: the Owner chip stopped 40px short (QA F-37).
                role ?? <span className="size-7 shrink-0" aria-hidden="true" />
            )}
        </div>
    )
}
