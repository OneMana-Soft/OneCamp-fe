/**
 * Active Users Bar — shows who is currently editing the document
 * Notion/Google Docs style colored avatar stack with portal-based tooltips
 * Uses Radix UI Tooltip (ported) so tooltips escape the top bar stacking context
 */
/**
 * Active Users Bar — shows who is currently editing the document
 * (Notion / Google Docs style colored avatar stack with portal tooltips).
 * Uses Radix Tooltip so popups escape the top bar stacking context.
 */
"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { getNameInitials } from "@/lib/utils/getNameInitials"

export interface ActiveUser {
    id: string
    name: string
    color: string
    profileKey?: string
}

interface ActiveUsersBarProps {
    users: ActiveUser[]
    maxShown?: number
    className?: string
}

function AvatarImage({
    profileKey,
    name,
    color,
}: {
    profileKey?: string
    name: string
    color: string
}) {
    const { src } = useUserAvatar(profileKey)
    const hasImage = !!src

    return (
        <div
            className={cn(
                "relative flex items-center justify-center rounded-full overflow-hidden",
                "size-6 border-2 border-background shadow-sm",
                !hasImage && "text-[10px] font-bold text-white",
            )}
            style={{ backgroundColor: hasImage ? undefined : color }}
        >
            {hasImage ? (
                <img
                    src={src}
                    alt={name}
                    className="size-full object-cover"
                    onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                />
            ) : (
                getNameInitials(name)
            )}
        </div>
    )
}

function UserAvatar({
    user,
    index,
    total,
}: {
    user: ActiveUser
    index: number
    total: number
}) {
    return (
        <div style={{ zIndex: total - index }}>
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                    <div className="cursor-default transition-transform duration-150 hover:scale-110 hover:-translate-y-0.5">
                        <AvatarImage profileKey={user.profileKey} name={user.name} color={user.color} />
                    </div>
                </TooltipTrigger>
                <TooltipContent
                    side="top"
                    sideOffset={6}
                    className="px-2 py-0.5 text-[11px] font-semibold text-white border-0 shadow-lg"
                    style={{ backgroundColor: user.color }}
                >
                    {user.name}
                </TooltipContent>
            </Tooltip>
        </div>
    )
}

function RemainingBadge({ remaining, names }: { remaining: number; names: string }) {
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <div className="flex items-center justify-center rounded-full size-6 border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground cursor-default hover:bg-muted/80 transition-colors">
                    +{remaining}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="text-[11px] font-medium">
                {names}
            </TooltipContent>
        </Tooltip>
    )
}

export function ActiveUsersBar({ users, maxShown = 4, className }: ActiveUsersBarProps) {
    const uniqueUsers = React.useMemo(() => {
        const seen = new Set<string>()
        return users.filter((u) => {
            if (seen.has(u.id)) return false
            seen.add(u.id)
            return true
        })
    }, [users])

    const shown = uniqueUsers.slice(0, maxShown)
    const remaining = uniqueUsers.length - maxShown
    const remainingNames = uniqueUsers
        .slice(maxShown)
        .map((u) => u.name)
        .join(", ")

    if (uniqueUsers.length === 0) return null

    return (
        <div className={cn("flex items-center gap-0.5", className)}>
            {shown.map((user, i) => (
                <UserAvatar key={user.id} user={user} index={i} total={shown.length} />
            ))}
            {remaining > 0 && <RemainingBadge remaining={remaining} names={remainingNames} />}
        </div>
    )
}

