"use client";

import {useState, useRef, useLayoutEffect, useMemo, useEffect, useCallback} from "react";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
} from "@/components/ui/drawer";
import {ALL_REACTION_CATEGORIES, getReactionCategoryLabel, StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {useAddFrequentlyUsedReaction, useFrequentlyUsedReactions} from "@/hooks/reactions/useFrequentlyUsedReactions";
import {notEmpty} from "@/lib/utils/validation/notEmpty";
import {useSearchReactions} from "@/hooks/reactions/useSearchReactions";
import { SearchInput } from "@/components/ui/search-input";
import {MobileReactionPickerCategory} from "@/components/reactionPicker/MobileReactionPickerCategory";
import {Apple, Clock, Flag, Heart, Lightbulb, PawPrint, Plane, Smile, Trophy} from "@/lib/icons";
import {ix} from "@/lib/ui/interactive";
import {cn} from "@/lib/utils/helpers/cn";


export interface MobileReactionPickerProps {
    reactionDrawerOpenState: boolean;
    setReactionDrawerOpenState: (state: boolean) => void;
    showCustomReactions?: boolean
    onReactionSelect: (reaction: StandardReaction | SyncCustomReaction) => void
}

/** Each group's glyph in the bar (mobile.md K4). */
const GROUP_ICON: Record<string, typeof Clock> = {
    frequent: Clock,
    people: Smile,
    nature: PawPrint,
    foods: Apple,
    activity: Trophy,
    places: Plane,
    objects: Lightbulb,
    symbols: Heart,
    flags: Flag,
}

type Group = { id: string; reactions: (StandardReaction | SyncCustomReaction)[] }

/** The sheet's one scroller, its body (components/ui/drawer), holding `el`. */
const sheetBody = (el: HTMLElement | null) => el?.closest<HTMLElement>("[data-sheet-body]") ?? null

/**
 * THE PHONE'S EMOJI PICKER (mobile.md K4), for a reaction or a status.
 *
 * It took the large detent: a fixed 92% of the screen with the page pushed
 * back as a card, around a search box and five rows that scrolled sideways,
 * so it opened as a mostly empty slab ("expanding way too much"). It is the
 * half detent now, the size Slack and WhatsApp open theirs at, and the grid
 * fills it: the search box and a bar of the groups stay at the top of the
 * sheet's one scroller, and the groups follow one another under them in rows
 * of 44px cells. A group's glyph in the bar goes to it, and the bar marks the
 * group in view.
 *
 * While the search box has the on-screen keyboard, the sheet takes the large
 * height (app/phone.css), so what it finds shows above the keyboard. The page
 * stays put: a pick is a two-second job, not a place to go. Vaul's input
 * repositioning stays off: it left the sheet floating over a gap once the
 * keyboard closed (cccaad84).
 */
export function EmojiPickerDrawer({ showCustomReactions, onReactionSelect, reactionDrawerOpenState, setReactionDrawerOpenState }: MobileReactionPickerProps) {
    // The list, once the sheet's portal has drawn it: the scroller is found from it.
    const [list, setList] = useState<HTMLDivElement | null>(null)
    const headRef = useRef<HTMLDivElement>(null)
    const [query, setQuery] = useState('')
    const [current, setCurrent] = useState<string | null>(null)
    const { data } = useEmojiMartData()
    const { addReactionIdToFrequents } = useAddFrequentlyUsedReaction()
    const { frequentlyUsedReactions } = useFrequentlyUsedReactions({ hideCustomReactions: !showCustomReactions })
    const { reactionSearchResults } = useSearchReactions(query, {
        maxResults: 90,
        hideCustomReactions: !showCustomReactions
    })

    const [localOpen, setLocalOpen] = useState(reactionDrawerOpenState)

    useEffect(() => {
        setLocalOpen(reactionDrawerOpenState)
    }, [reactionDrawerOpenState])

    // Closed here first, so vaul plays the sheet out, then in the app's state.
    const close = useCallback(() => {
        setLocalOpen(false)
        setTimeout(() => setReactionDrawerOpenState(false), 400)
    }, [setReactionDrawerOpenState])

    const handleReactionSelect = useCallback((emoji: Parameters<MobileReactionPickerProps['onReactionSelect']>[number]) => {
        addReactionIdToFrequents(emoji)
        onReactionSelect(emoji)
        close()
    }, [addReactionIdToFrequents, onReactionSelect, close])

    const groups = useMemo<Group[]>(() => ALL_REACTION_CATEGORIES.map((id) => {
        if (id === 'frequent') return { id, reactions: frequentlyUsedReactions }
        // The catalogue's own emoji: a workspace's have no store, so no group offers them.
        const reactions = data?.categories
            .find((category) => category.id === id)
            ?.emojis.map((emojiId): StandardReaction | undefined => {
                const emoji = data?.emojis[emojiId]
                const native = emoji?.skins[0]?.native
                return emoji && native ? { id: emoji.id, name: emoji.name, native } : undefined
            })
            .filter(notEmpty)
        return { id, reactions: reactions ?? [] }
    }).filter((g) => g.reactions.length > 0), [frequentlyUsedReactions, data])

    // A new search starts at the top.
    useLayoutEffect(() => {
        const body = sheetBody(list)
        if (body) body.scrollTop = 0
    }, [list, query])

    // The group in view: the last whose name has gone up under the bar.
    useEffect(() => {
        const body = sheetBody(list)
        if (!body || query) return
        let frame = 0
        const mark = () => {
            frame = 0
            const line = (headRef.current?.getBoundingClientRect().bottom ?? body.getBoundingClientRect().top) + 1
            let id: string | null = null
            for (const el of Array.from(body.querySelectorAll<HTMLElement>("[data-emoji-group]"))) {
                if (el.getBoundingClientRect().top <= line) id = el.dataset.emojiGroup ?? null
            }
            setCurrent(id ?? groups[0]?.id ?? null)
        }
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(mark)
        }
        mark()
        body.addEventListener("scroll", onScroll, { passive: true })
        return () => {
            body.removeEventListener("scroll", onScroll)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [list, groups, query])

    const goTo = (id: string) => {
        const body = sheetBody(list)
        const group = body?.querySelector<HTMLElement>(`[data-emoji-group="${id}"]`)
        if (!body || !group) return
        const top = group.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - (headRef.current?.offsetHeight ?? 0)
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        if (body.scrollTo) body.scrollTo({ top, behavior: reduce ? "auto" : "smooth" })
        else body.scrollTop = top
        setCurrent(id)
    }

    return (
        <Drawer detent="half" open={localOpen} onOpenChange={(open) => { if (!open) close() }} repositionInputs={false}>
            <DrawerContent data-emoji-sheet="">
                <DrawerTitle className="sr-only">Pick an emoji</DrawerTitle>
                <DrawerDescription className="sr-only">Search, or go to a group</DrawerDescription>
                <div ref={headRef} className="sticky top-0 z-[1] bg-pop px-3 pb-1 pt-1">
                    <SearchInput value={query} onValueChange={setQuery} placeholder="Search" aria-label="Search emoji" className="rounded-[10px]" />
                    {query ? null : (
                        <div role="group" aria-label="Emoji groups" data-vaul-no-drag="" className="mt-1.5 flex">
                            {groups.map(({ id }) => {
                                const Icon = GROUP_ICON[id] ?? Smile
                                const on = current === id
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        aria-label={getReactionCategoryLabel(id)}
                                        aria-current={on || undefined}
                                        {...ix("icon", { selected: on })}
                                        onClick={() => goTo(id)}
                                        className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-[10px]"
                                    >
                                        <Icon aria-hidden="true" className={cn("size-[18px]", on ? "text-brand" : "text-ink-3")} />
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
                <div ref={setList} className="px-2 pb-3">
                    {query ? (
                        reactionSearchResults.length ? (
                            <MobileReactionPickerCategory id="search" reactions={reactionSearchResults} onReactionSelect={handleReactionSelect} />
                        ) : (
                            <p className="px-1.5 py-6 text-center text-ui text-ink-2">No emoji match “{query.trim()}”</p>
                        )
                    ) : (
                        groups.map((g) => <MobileReactionPickerCategory key={g.id} id={g.id} reactions={g.reactions} onReactionSelect={handleReactionSelect} />)
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
