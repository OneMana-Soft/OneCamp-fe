"use client"
import { displayNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileDataInterface } from "@/types/user"
import { useBotKindMap } from "@/hooks/useBotKinds"
import { isAIBot } from "@/lib/botCopy"

interface TypingIndicatorProps {
    users: UserProfileDataInterface[]
    className?: string
}

/** "Maya Chen is typing", "Maya and Jonas are typing", "Several people are typing". */
export function typingCopy(names: string[]): string {
    if (names.length === 0) return ""
    if (names.length === 1) return `${names[0]} is typing`
    if (names.length === 2) return `${names[0].split(" ")[0]} and ${names[1].split(" ")[0]} are typing`
    return "Several people are typing"
}

/**
 * Who is typing (design v3 chat, C59): a whisper, not a component. A line of
 * its own that is always there, 22px, so the composer never jumps when it
 * fills or empties: three 4px dots bobbing in turn and the words at 12px ink-3.
 * No avatars, no pill, no border. An agent at work says so in its own ink,
 * with the shimmer. Under reduced motion the dots stand still at 60%.
 */
export function TypingIndicator({ users, className }: TypingIndicatorProps) {
    const kinds = useBotKindMap()
    const agent = users.find((u) => u.is_bot && isAIBot(kinds?.[u.user_uuid]))
    const people = users.filter((u) => u !== agent)
    const text = agent ? `${displayNameOf(agent)} is working` : typingCopy(people.map((u) => displayNameOf(u)))
    const live = users.length > 0
    return (
        <div
            data-typing-line=""
            role="status"
            aria-live="polite"
            className={cn("flex h-[22px] items-center gap-2 pl-1 text-meta text-ink-3 transition-opacity duration-[140ms]", live ? "opacity-100" : "opacity-0", className)}
        >
            {live && (
                <>
                    <span aria-hidden="true" className="flex gap-[3px]">
                        {[0, 1, 2].map((i) => (
                            <i key={i} className={cn("size-1 rounded-full animate-typing-bob", agent ? "bg-agent" : "bg-ink-3")} style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                    </span>
                    <span key={text} className={cn("truncate animate-fade-in", agent && "text-agent-ink")}>{text}</span>
                </>
            )}
        </div>
    )
}
