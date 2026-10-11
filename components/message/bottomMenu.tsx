import { useEffect, useRef, useState } from "react"
import { ReactionPill } from "@/components/message/reactionPill"
import { AddReactionTrigger } from "@/components/reactionPicker/AddReactionTrigger"

interface BottomMenuProps {
    reactions: { [key: string]: string[] }
    handleEmojiClick: (id: string) => void
    selectedEmojiId: string
    /** The reader's own name, said as "you" in who reacted. */
    selfName?: string
    /** The reaction the reader just made as their first on this message: it bursts. */
    burstEmojiId?: string
}

/** How long a pill that reached zero stays to shrink away (react-out). */
const LEAVE_MS = 130

/**
 * The reactions under a message (design v3 chat, C21), 8px under what is
 * above, 6px apart, then the add button: a 26px circle with the smile+.
 *
 * What moves is only what changed while the message is on screen: a pill
 * that appears pops in, one that reaches zero shrinks away; the pills a
 * message was drawn with stand still.
 */
export const BottomMenu = ({ reactions, handleEmojiClick, selectedEmojiId, selfName, burstEmojiId }: BottomMenuProps) => {
    // The pills this row was first drawn with never animate.
    const initial = useRef<Set<string> | null>(null)
    if (initial.current === null) initial.current = new Set(Object.keys(reactions))
    const prev = useRef(reactions)
    const [leaving, setLeaving] = useState<Record<string, string[]>>({})

    useEffect(() => {
        const gone: Record<string, string[]> = {}
        for (const [id, names] of Object.entries(prev.current)) if (!reactions[id]) {
            gone[id] = names
            // Back later, it is new again and pops in.
            initial.current?.delete(id)
        }
        prev.current = reactions
        if (Object.keys(gone).length === 0) return
        setLeaving((l) => ({ ...l, ...gone }))
        const t = window.setTimeout(() => {
            setLeaving((l) => {
                const next = { ...l }
                for (const id of Object.keys(gone)) delete next[id]
                return next
            })
        }, LEAVE_MS)
        return () => window.clearTimeout(t)
    }, [reactions])

    const ids = Object.keys(reactions)
    const leavingIds = Object.keys(leaving).filter((id) => !reactions[id])
    if (ids.length === 0 && leavingIds.length === 0) return null

    return (
        <div data-reactions="" className="mt-2 flex flex-wrap items-center justify-start gap-1.5">
            {ids.map((emojiId) => (
                <ReactionPill
                    key={emojiId}
                    emojiId={emojiId}
                    reactionUserNames={reactions[emojiId]}
                    onClickEmoji={handleEmojiClick}
                    isSelected={selectedEmojiId == emojiId}
                    selfName={selfName}
                    motion={initial.current!.has(emojiId) ? undefined : "pop"}
                    burst={burstEmojiId === emojiId && selectedEmojiId === emojiId}
                />
            ))}
            {leavingIds.map((emojiId) => (
                <ReactionPill
                    key={`leaving-${emojiId}`}
                    emojiId={emojiId}
                    reactionUserNames={leaving[emojiId]}
                    onClickEmoji={() => {}}
                    isSelected={false}
                    motion="out"
                />
            ))}
            <AddReactionTrigger
                onReactionSelect={(id) => handleEmojiClick(id)}
                showCustomReactions={false}
                className="size-[26px] rounded-[13px] bg-transparent text-ink-3 ring-1 ring-inset ring-line hover:bg-hover hover:text-ink [&_svg]:size-3.5 pointer-coarse:size-8"
            />
        </div>
    )
}
