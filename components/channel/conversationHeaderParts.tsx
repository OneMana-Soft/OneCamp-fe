"use client"

import * as React from "react"
import Link from "next/link"
import {
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Bell, BellOff, Headphones, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { NotificationType } from "@/types/channel"
import { ChatFace } from "@/components/message/chatFace"

/** A header's icon button (design v3 chat, C01): 28px, ink-3 going to ink. */
export const HEADER_ICON = "size-7 rounded-md p-0 text-ink-3 hover:bg-hover hover:text-ink data-[state=open]:bg-press data-[state=open]:text-ink [&_svg]:size-4"

export const NOTIFICATION_CHOICES: { value: string; label: string }[] = [
    { value: NotificationType.NotificationAll, label: "Everything" },
    { value: NotificationType.NotificationMention, label: "Mentions and threads you're in" },
    { value: NotificationType.NotificationBlock, label: "Nothing (muted)" },
]

/**
 * Notifications as a menu (C04), never a bell that changes the level each time
 * it is clicked: three radio items, one click to choose. A submenu of More and
 * of the Details sheet.
 */
export function NotificationSubmenu({ value, onChange, busy }: { value: string; onChange: (v: string) => void; busy?: boolean }) {
    const muted = value === NotificationType.NotificationBlock
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                {muted ? <BellOff className="text-ink-3" aria-hidden="true" /> : <Bell className="text-ink-3" aria-hidden="true" />}
                Notifications
                <span className="ml-auto max-w-[7rem] truncate pl-3 text-meta text-ink-3">{value === NotificationType.NotificationMention ? "Mentions" : muted ? "Muted" : "Everything"}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="pop-surface w-64 p-1">
                <DropdownMenuRadioGroup value={value} onValueChange={(v) => !busy && v !== value && onChange(v)}>
                    {NOTIFICATION_CHOICES.map((c) => (
                        <DropdownMenuRadioItem key={c.value} value={c.value}>
                            {c.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    )
}

/**
 * The huddle entry (C06). Idle, the one labelled action in a header:
 * "Huddle" on the raised surface at e1. Live, a moss chip ("on air" without
 * a red record cue): a dot whose single ring leaves it every 2.4 s, and
 * "Join". Reduced motion keeps the dot and drops the ring.
 */
export function HuddleButton({ href, live, onOpen, compact = false }: { href: string; live: boolean; onOpen?: (e: React.MouseEvent) => void; compact?: boolean }) {
    if (live) {
        return (
            <Link
                href={href}
                onClick={onOpen}
                aria-label="Join the huddle in progress"
                title="Join the huddle in progress"
                data-huddle-live=""
                className={cn(
                    "inline-flex h-7 items-center gap-2 rounded-md bg-camp-moss-tint px-2.5 text-ui-sm font-medium text-camp-moss-ink transition-colors duration-[180ms] hover:bg-[color-mix(in_oklab,var(--camp-moss-tint)_85%,var(--camp-moss))]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
            >
                <span aria-hidden="true" className="relative flex size-2">
                    <span className="absolute inset-0 rounded-full bg-camp-moss motion-safe:animate-live-halo" />
                    <span className="relative size-2 rounded-full bg-camp-moss" />
                </span>
                {compact ? null : "Join"}
            </Link>
        )
    }
    return (
        <Button asChild size="sm" variant="secondary" className="h-7 gap-1.5 px-2.5 [&_svg]:size-3.5">
            <Link href={href} onClick={onOpen} aria-label="Start a huddle" title="Start a huddle">
                <Headphones aria-hidden="true" />
                {compact ? null : "Huddle"}
            </Link>
        </Button>
    )
}

/**
 * A huddle started where you are reading (C06): a 44px strip under the header
 * until you join, dismiss it, or the call ends. It enters with pill-in.
 */
export function HuddleBanner({ href, onOpen }: { href: string; onOpen?: (e: React.MouseEvent) => void }) {
    const [dismissed, setDismissed] = React.useState(false)
    if (dismissed) return null
    return (
        <div data-huddle-banner="" role="status" className="mx-5 mt-3 flex h-11 shrink-0 animate-pill-in items-center gap-3 rounded-xl bg-sunken pl-4 pr-2 text-ui text-ink">
            <Headphones className="size-4 text-camp-moss" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">A huddle is on</span> <span className="text-ink-2">· drop in to talk</span>
            </span>
            <Button asChild size="sm">
                <Link href={href} onClick={onOpen}>Join</Link>
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Dismiss" title="Dismiss" onClick={() => setDismissed(true)} className={HEADER_ICON}>
                <X aria-hidden="true" />
            </Button>
        </div>
    )
}

export interface StackPerson {
    uuid: string
    name: string
    profileKey?: string
    isBot?: boolean
}

/**
 * Who is here (C01): up to four 22px faces overlapping 6px on a ring of the
 * sheet, agents as their squares, then the count. One button: it opens the
 * members.
 */
export function MemberStack({ people, count, onClick }: { people: StackPerson[]; count: number; onClick: () => void }) {
    const shown = people.slice(0, 4)
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${count} ${count === 1 ? "member" : "members"}. Show members`}
            title="Members"
            className="flex h-7 items-center gap-1.5 rounded-md pl-1 pr-1.5 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
            {shown.length > 0 && (
                <span className="flex -space-x-1.5">
                    {shown.map((p) => (
                        <span key={p.uuid} className="inline-flex rounded-full ring-2 ring-sheet [&_[data-agent-avatar]]:rounded-[32%] [&:has([data-agent-avatar],[data-bot-avatar])]:rounded-[32%]">
                            <ChatFace name={p.name} profileKey={p.profileKey} userUUID={p.uuid} isBot={p.isBot} size={22} />
                        </span>
                    ))}
                </span>
            )}
            <span className="text-meta tabular-nums text-ink-3">{count}</span>
        </button>
    )
}
