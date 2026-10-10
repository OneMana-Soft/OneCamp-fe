/**
 * Active Users Bar: who else has the doc or board open, as a row of faces.
 * Each is their photo, or their initials in their identity hue (lib/campHue,
 * the same colour their cursor, their name and their avatar carry everywhere
 * else), so a collaborator is recognisable at a glance. The name shows in an
 * ink tooltip, the app's one tooltip style.
 */
"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"

interface ActiveUser {
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

const FACE = 24

function UserAvatar({ user }: { user: ActiveUser }) {
    const { src } = useUserAvatar(user.profileKey)
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    role="img"
                    aria-label={user.name}
                    className="inline-flex rounded-full ring-2 ring-background transition-transform duration-[120ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-ring motion-reduce:transform-none"
                >
                    <IdentityMark id={user.id} label={user.name} src={src || undefined} variant="avatar" size={FACE} />
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="text-2xs font-medium">
                {user.name}
            </TooltipContent>
        </Tooltip>
    )
}

function RemainingBadge({ remaining, names }: { remaining: number; names: string }) {
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    role="img"
                    aria-label={`${remaining} more: ${names}`}
                    className="flex size-6 items-center justify-center rounded-full bg-muted text-2xs font-medium tabular-nums text-muted-foreground ring-2 ring-background focus-visible:outline-none focus-visible:ring-ring"
                >
                    +{remaining}
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="text-2xs font-medium">
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

    if (uniqueUsers.length === 0) return null

    const shown = uniqueUsers.slice(0, maxShown)
    const remaining = uniqueUsers.length - maxShown
    const remainingNames = uniqueUsers
        .slice(maxShown)
        .map((u) => u.name)
        .join(", ")

    return (
        <div role="group" className={cn("flex items-center -space-x-1.5", className)} aria-label="Here now">
            {shown.map((user) => (
                <UserAvatar key={user.id} user={user} />
            ))}
            {remaining > 0 && <RemainingBadge remaining={remaining} names={remainingNames} />}
        </div>
    )
}
