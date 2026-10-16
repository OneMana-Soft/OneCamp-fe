"use client"

import type { ReactNode } from "react"
import { Hash } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics/motifs"
import { ChatFace } from "@/components/message/chatFace"
import { SpotWelcome } from "@/components/ui/graphics/spots"
import { cn } from "@/lib/utils/helpers/cn"
import type { CampHue } from "@/lib/campHue"

export interface EmptyFace {
    uuid: string
    name: string
    profileKey?: string
    isBot?: boolean
}

export interface StarterChip {
    label: string
    icon?: ReactNode
    onClick: () => void
}

interface ConversationEmptyProps {
    /** What kind of conversation: the channel's orbit, a person, or a group. */
    kind?: "channel" | "dm" | "agent" | "group"
    title: string
    description?: string
    /** The channel's members (people and agents) on the orbit, or the person, or the group. */
    faces?: EmptyFace[]
    chips?: StarterChip[]
    /** @deprecated a conversation has no hue of its own any more (C58). */
    hue?: CampHue
    /**
     * "fill" (the default): the whole empty list, sat just above the composer.
     * "start": the head of a history that has messages, above the first of
     * them, once nothing older is left to load (MessageListVirtua's start).
     */
    placement?: "fill" | "start"
}

// Where the orbit's faces rest (degrees, 0 = right), and its two hue dots.
const ORBIT_ANGLES = [-150, -60, 20, 110, 200]

/**
 * The orbit (design v3 chat, C58; DESIGN_V3 §3.13): a tint disc, one dashed
 * orbit, the channel's # in a raised tile at the centre, its real members on
 * the orbit as 22px faces (agents as their squares), two hue dots and one
 * accent spark. On first sight the faces travel 24 degrees to rest and the
 * spark twinkles once; reduced motion keeps it still.
 */
function Orbit({ faces, size = 120 }: { faces: EmptyFace[]; size?: number }) {
    const r = size * 0.4
    return (
        <div aria-hidden="true" data-orbit="" className="relative shrink-0" style={{ width: size, height: size }}>
            <span className="absolute inset-[6%] rounded-full bg-sunken" />
            <svg className="absolute inset-0 text-line-3" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="48" stroke="currentColor" strokeWidth="1.25" strokeDasharray="1.5 5" strokeLinecap="round" />
            </svg>
            <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-raised text-ink-2 shadow-e2">
                <Hash className="size-[18px]" />
            </span>
            {faces.slice(0, 5).map((f, i) => {
                const a = ORBIT_ANGLES[i]
                return (
                    <span
                        key={f.uuid}
                        className="absolute left-1/2 top-1/2 motion-safe:animate-orbit-in"
                        style={{ transform: `rotate(${a}deg)`, animationDelay: `${i * 60}ms` }}
                    >
                        <span className="absolute" style={{ transform: `translate(${r - 11}px, -11px)` }}>
                            <span className="block rounded-full ring-[2.5px] ring-sheet motion-safe:animate-orbit-in-counter [&:has([data-agent-avatar])]:rounded-[32%]" style={{ transform: `rotate(${-a}deg)`, animationDelay: `${i * 60}ms` }}>
                                <ChatFace name={f.name} profileKey={f.profileKey} userUUID={f.uuid} isBot={f.isBot} size={22} />
                            </span>
                        </span>
                    </span>
                )
            })}
            <span className="hue-sun absolute left-[18%] top-[70%] size-1 rounded-full bg-hue" />
            <span className="hue-lake absolute right-[14%] top-[30%] size-1 rounded-full bg-hue" />
            <span className="absolute right-[10%] top-[6%] text-brand motion-safe:animate-twinkle" style={{ animationDelay: "500ms" }}>
                <Spark size={12} />
            </span>
        </div>
    )
}

/**
 * A conversation with nothing in it yet (design v3 chat, C58), sitting just
 * above the composer, left-aligned with the message column. A channel draws
 * its orbit of real members and "This is the start of #engineering"; a DM the
 * other person's 64px face; an agent DM its square and what it may do; a
 * group its three faces. Then the starter chips, so the first move is one
 * click. No hue from the conversation's id: a channel has no hue.
 */
export function ConversationEmpty({ kind = "channel", title, description, faces = [], chips = [], placement = "fill" }: ConversationEmptyProps) {
    return (
        <div
            className={cn("flex flex-col px-5", placement === "fill" ? "h-full justify-end pb-6" : "pb-3 pt-10")}
            data-conversation-empty={placement === "fill" ? "" : undefined}
            data-empty-kind={kind}
        >
            {kind === "channel" ? (
                faces.length > 0 ? <Orbit faces={faces} /> : <SpotWelcome size={96} className="-ml-1" />
            ) : kind === "group" ? (
                <span aria-hidden="true" className="relative flex h-12 w-[88px]">
                    {faces.slice(0, 3).map((f, i) => (
                        <span key={f.uuid} className="absolute rounded-full ring-[2.5px] ring-sheet" style={{ left: i * 24, top: i === 1 ? 6 : 0 }}>
                            <ChatFace name={f.name} profileKey={f.profileKey} userUUID={f.uuid} isBot={f.isBot} size={40} />
                        </span>
                    ))}
                </span>
            ) : faces[0] ? (
                <ChatFace name={faces[0].name} profileKey={faces[0].profileKey} userUUID={faces[0].uuid} isBot={faces[0].isBot} size={64} />
            ) : null}
            <p className={cn("mt-4 text-pretty text-ink", kind === "channel" ? "text-title-2" : "text-title-3")}>{title}</p>
            {description && <p className="mt-0.5 max-w-[56ch] text-pretty text-ui text-ink-2">{description}</p>}
            {chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {chips.map((c) => (
                        <button
                            key={c.label}
                            type="button"
                            onClick={c.onClick}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-hover px-2.5 text-ui-sm font-medium text-ink transition-colors hover:bg-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5 [&_svg]:text-ink-3"
                        >
                            {c.icon}
                            {c.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
