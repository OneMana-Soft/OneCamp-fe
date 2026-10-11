import { useEffect, useRef } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { cn } from "@/lib/utils/helpers/cn"
import { nameList } from "@/lib/utils/format/nameList"
import { celebrate, springPop } from "@/lib/celebrate"
import { RollingCount } from "@/components/message/rollingCount"

interface reactionPillProps {
    emojiId: string
    reactionUserNames: string[]
    onClickEmoji: (emojiId: string) => void
    isSelected: boolean
    /** The reader's own name, said as "you" in who reacted. */
    selfName?: string
    /** How it enters: "pop" when it appeared on screen, "out" when it is leaving at zero. */
    motion?: "pop" | "out"
    /** Your first reaction on this message: three small sparks leave it, once. */
    burst?: boolean
}

// The small burst spends itself once per ten seconds, whatever the message:
// a playful moment that came on every click would stop being one.
let lastBurst = -Infinity
const BURST_EVERY_MS = 10_000

/** "Maya, Jonas and you": who reacted, the reader last and as "you". */
export function reactedBy(names: string[], selfName?: string): string {
    const others = names.filter((n) => n && n !== selfName)
    const mine = !!selfName && names.includes(selfName)
    const list = mine ? [...others, "you"] : others
    return nameList(list, 7)
}

/**
 * A reaction under a message (design v3 chat, C21): a 26px pill on the hover
 * overlay inside a hairline, the emoji at 16px and its count tabular. Yours is
 * the accent's soft ground with an accent ring and count, one of the few
 * places the accent is spent: on you. A pill that appears while you watch
 * pops in on the spring; your +1 springs it, anyone's rolls the count; one
 * that reaches zero shrinks away. Hovering says who, after 300 ms.
 */
export const ReactionPill = ({ emojiId, reactionUserNames, onClickEmoji, isSelected, selfName, motion, burst = false }: reactionPillProps) => {
    const ref = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!burst || !ref.current) return
        const now = performance.now()
        if (now - lastBurst < BURST_EVERY_MS) return
        lastBurst = now
        celebrate(ref.current, { count: 3, reach: 14 })
    }, [burst])

    const onClickEmojiHandle = (e: React.MouseEvent) => {
        e.stopPropagation()
        // Adding your reaction answers with a little spring (lib/celebrate);
        // taking it back does not.
        if (!isSelected) springPop(e.currentTarget)
        onClickEmoji(emojiId)
    }

    const emojiData = useEmojiMartData()
    const emoji = findEmojiMartEmojiByEmojiID(emojiData.data, emojiId)
    const emojiString = emoji?.skins[0].native
    const count = reactionUserNames.length || 0
    const who = reactedBy(reactionUserNames, selfName)
    const label = `${emoji?.name ?? "Reaction"}: ${count} ${count === 1 ? "person" : "people"}${who ? ` (${who})` : ""}. ${isSelected ? "Remove your reaction" : "Add your reaction"}`

    return (
        <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
                <button
                    ref={ref}
                    type="button"
                    data-reaction=""
                    data-no-ripple="true"
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={onClickEmojiHandle}
                    aria-label={label}
                    aria-pressed={isSelected}
                    className={cn(
                        "inline-flex h-[26px] items-center gap-1.5 rounded-[13px] px-2 text-meta font-medium leading-none",
                        "transition-[background-color,box-shadow,scale] duration-[140ms] ease-out active:scale-[0.96] active:duration-[90ms]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-8",
                        isSelected
                            ? "bg-brand-muted text-brand-text ring-1 ring-inset ring-brand/35 hover:bg-[color-mix(in_oklab,var(--brand)_18%,var(--brand-muted))] dark:bg-brand/14"
                            : "bg-hover text-ink-2 ring-1 ring-inset ring-line hover:bg-press hover:ring-line-3",
                        motion === "pop" && "animate-react-pop",
                        motion === "out" && "pointer-events-none animate-react-out",
                    )}
                >
                    <span className="text-base leading-none" aria-hidden="true">{emojiString}</span>
                    <RollingCount value={count} />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="pop-surface flex max-w-72 items-center gap-2.5 px-3 py-2 text-ink">
                <span className="text-[2rem] leading-none" aria-hidden="true">{emojiString}</span>
                <span className="text-xs leading-4 text-ink-2">
                    <span className="text-ink">{who}</span> reacted with {emoji?.id ? `:${emoji.id}:` : "this"}
                </span>
            </TooltipContent>
        </Tooltip>
    )
}
