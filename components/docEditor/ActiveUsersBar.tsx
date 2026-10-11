/**
 * Active Users Bar (content.md D15): who else has the doc or board open, as
 * a stack of v3 avatars: 24 px, overlapping 6 px with a 2 px sheet ring, at
 * most four and then "+3". Each is their photo or their gradient with
 * initials, in their identity hue (lib/campHue), the colour their caret and
 * name flag carry too; an agent is a square. A 6 px status sits at the bottom
 * right. Selecting the stack opens a list of who is here, each with "Jump
 * to", which scrolls to their caret in the doc.
 */
"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar } from "@/components/ui/graphics"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"

export interface ActiveUser {
    id: string
    name: string
    color: string
    profileKey?: string
    /** An agent working in the doc: drawn as a square. */
    agent?: boolean
}

interface ActiveUsersBarProps {
    users: ActiveUser[]
    maxShown?: number
    className?: string
}

const FACE = 24

function Face({ user }: { user: ActiveUser }) {
    const { src } = useUserAvatar(user.profileKey)
    return (
        <span
            role="img"
            aria-label={user.name}
            data-agent={user.agent || undefined}
            className={cn(
                "content-pop-in relative inline-flex size-6 ring-2 ring-sheet transition-transform duration-[140ms] ease-out group-hover/stack:-translate-y-0.5 motion-reduce:transform-none",
                user.agent ? "rounded-[32%]" : "rounded-full",
            )}
        >
            {user.agent ? (
                <AgentAvatar src={src || undefined} />
            ) : (
                <IdentityMark id={user.id} label={user.name} src={src || undefined} variant="avatar" size={FACE} />
            )}
            <span aria-hidden="true" data-presence-status="" className="absolute -bottom-px -right-px size-1.5 rounded-full bg-camp-moss ring-2 ring-sheet" />
        </span>
    )
}

/** Their caret in the doc, if the editor is showing it. */
function caretOf(name: string): HTMLElement | null {
    const carets = document.querySelectorAll<HTMLElement>(".collaboration-cursor__caret")
    for (const c of carets) if (c.title === name) return c
    return null
}

/** Scrolls to someone's caret (400 ms, eased) and opens their flag on arrival. */
export function jumpToCaret(name: string): boolean {
    const caret = caretOf(name)
    if (!caret) return false
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    caret.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
    const label = caret.querySelector<HTMLElement>(".collaboration-cursor__label")
    if (label) {
        label.style.animation = "none"
        void label.offsetWidth
        label.style.animation = ""
    }
    return true
}

export function ActiveUsersBar({ users, maxShown = 4, className }: ActiveUsersBarProps) {
    const [open, setOpen] = React.useState(false)
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
                            className={cn(
                                "group/stack mr-1 flex items-center -space-x-1.5 rounded-lg p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand",
                                className,
                            )}
                        >
                            {shown.map((user) => (
                                <Face key={user.id} user={user} />
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
            <PopoverContent align="end" sideOffset={8} className="content-float w-60 rounded-xl p-1 shadow-e3" data-presence-list="">
                <p className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Here now</p>
                <ul>
                    {uniqueUsers.map((u) => (
                        <li key={u.id} className="flex h-8 items-center gap-2 rounded-lg px-2 hover:bg-hover">
                            <span aria-hidden="true" className={cn(HUE_CLASS[hueFor(u.id || u.name)], "h-3.5 w-0.5 shrink-0 rounded-[1px] bg-[var(--hue-a1)]")} />
                            <span className="min-w-0 flex-1 truncate text-ui font-[450] text-ink">{u.name}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false)
                                    jumpToCaret(u.name)
                                }}
                                className="h-6 shrink-0 rounded-md px-2 text-meta font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                            >
                                Jump to
                            </button>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    )
}
