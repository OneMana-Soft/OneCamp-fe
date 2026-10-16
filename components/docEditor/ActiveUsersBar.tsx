/**
 * Active Users Bar (content.md D15): who has the doc or board open, as a
 * stack of v3 avatars (24 px, 6 px overlap, 2 px sheet ring, at most four
 * then "+3"), each in their identity hue; an agent is a square. The dot says
 * how they are here (B8): moss while active, a hollow amber ring after 2
 * minutes idle, and the face's name says Editing, Viewing or Idle. The stack
 * opens "Here now" (presence/PresenceList, loaded on first open): Jump to and
 * Follow, by awareness client, never by name (N50).
 */
"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar } from "@/components/ui/graphics"
import { identityPerson } from "@/lib/identityHue"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { useDocBus } from "@/components/docEditor/registry/commandBus"
import { stateOf, usePresence } from "@/components/docEditor/presence/store"

export interface ActiveUser {
    id: string
    name: string
    color: string
    /** Their identity hue, as their tab sent it (lib/identityHue). */
    hue?: string
    profileKey?: string
    /** An agent working in the doc: drawn as a square. */
    agent?: boolean
    /** "viewing" for someone who can only read (A2). */
    mode?: "editing" | "viewing"
}

interface ActiveUsersBarProps {
    users: ActiveUser[]
    maxShown?: number
    className?: string
}

const FACE = 24
const loadList = () => import("@/components/docEditor/presence/PresenceList")
const PresenceList = React.lazy(loadList)

function Face({ user, state }: { user: ActiveUser; state?: string }) {
    const { src } = useUserAvatar(user.profileKey)
    return (
        <span
            role="img"
            aria-label={state ? `${user.name}, ${state}` : user.name}
            data-agent={user.agent || undefined}
            className={cn(
                "content-pop-in relative inline-flex size-6 ring-2 ring-sheet transition-transform duration-[140ms] ease-out group-hover/stack:-translate-y-0.5 motion-reduce:transform-none",
                user.agent ? "rounded-[32%]" : "rounded-full",
            )}
        >
            {user.agent ? (
                <AgentAvatar src={src || undefined} />
            ) : (
                // Their identity hue (collaboratorHue's rule): keyed as every
                // avatar is, the hue their tab sent winning, so the face, their
                // @mention and their caret here are one colour.
                <IdentityMark id={avatarSeed(identityPerson(user))} chosen={user.hue} label={user.name} src={src || undefined} variant="avatar" size={FACE} />
            )}
            {/* The app's presence dot (design v3 §3.9): a disc, or a hollow sun ring when away. */}
            <span aria-hidden="true" data-presence-status={state === "idle" ? "idle" : "here"} data-presence={state === "idle" ? "away" : "online"} className="presence-dot" />
        </span>
    )
}

export function ActiveUsersBar({ users, maxShown = 4, className }: ActiveUsersBarProps) {
    const [open, setOpen] = React.useState(false)
    const presence = usePresence(useDocBus().docId)
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
    const names = uniqueUsers.map((u) => u.name).join(", ")

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Here now: ${names}`}
                            data-presence-stack=""
                            // The list loads as the pointer or the focus arrives, so it opens at once.
                            onPointerEnter={() => void loadList()}
                            onFocus={() => void loadList()}
                            className={cn(
                                "group/stack mr-1 flex items-center -space-x-1.5 rounded-lg p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand",
                                className,
                            )}
                        >
                            {shown.map((user) => (
                                <Face key={user.id} user={user} state={stateOf(presence?.people[user.id], user.mode)} />
                            ))}
                            {remaining > 0 && (
                                <span
                                    role="img"
                                    aria-label={`${remaining} more: ${remainingNames}`}
                                    className="relative flex size-6 items-center justify-center rounded-full bg-sunken text-micro font-semibold tabular-nums text-ink-2 ring-2 ring-sheet"
                                >
                                    +{remaining}
                                </span>
                            )}
                        </button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                    {names}
                </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" sideOffset={8} className="content-float w-72 rounded-xl p-1 shadow-e3" data-presence-list="">
                <p className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Here now</p>
                <React.Suspense fallback={<div className="h-9" />}>
                    <PresenceList users={uniqueUsers} onDone={() => setOpen(false)} />
                </React.Suspense>
            </PopoverContent>
        </Popover>
    )
}
