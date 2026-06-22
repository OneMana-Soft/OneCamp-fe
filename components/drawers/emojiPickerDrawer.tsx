"use client";

import {useState, useRef, useLayoutEffect, useMemo} from "react";
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import {ALL_REACTION_CATEGORIES, StandardReaction, SyncCustomReaction, SyncCustomReactionResp} from "@/types/reaction";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {useAddFrequentlyUsedReaction, useFrequentlyUsedReactions} from "@/hooks/reactions/useFrequentlyUsedReactions";
import {useFetch} from "@/hooks/useFetch";
import {notEmpty} from "@/lib/utils/validation/notEmpty";
import {useSearchReactions} from "@/hooks/reactions/useSearchReactions";
import {Input} from "@/components/ui/input";
import {MobileReactionPickerCategory} from "@/components/reactionPicker/MobileReactionPickerCategory";
import * as React from "react";


export interface MobileReactionPickerProps {
    reactionDrawerOpenState: boolean;
    setReactionDrawerOpenState: (state: boolean) => void;
    showCustomReactions?: boolean
    onReactionSelect: (reaction: StandardReaction | SyncCustomReaction) => void
}

export function EmojiPickerDrawer({ showCustomReactions, onReactionSelect, reactionDrawerOpenState, setReactionDrawerOpenState }: MobileReactionPickerProps) {
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const [query, setQuery] = useState('')
    const { data } = useEmojiMartData()
    const { addReactionIdToFrequents } = useAddFrequentlyUsedReaction()
    const customReactions = useFetch<SyncCustomReactionResp>("")
    const { frequentlyUsedReactions } = useFrequentlyUsedReactions({ hideCustomReactions: !showCustomReactions })
    const { reactionSearchResults } = useSearchReactions(query, {
        maxResults: 90,
        hideCustomReactions: !showCustomReactions
    })

    const [localOpen, setLocalOpen] = useState(reactionDrawerOpenState)

    React.useEffect(() => {
        setLocalOpen(reactionDrawerOpenState)
    }, [reactionDrawerOpenState])

    const handleReactionSelect = (emoji: Parameters<MobileReactionPickerProps['onReactionSelect']>[number]) => {
        addReactionIdToFrequents({ id: emoji.id })
        onReactionSelect(emoji)

        // Close locally first to trigger the vaul animation
        setLocalOpen(false)

        setTimeout(() => {
            closeDrawer()
        }, 400); // 400ms is usually enough for the drawer exit animation

    }

    useLayoutEffect(() => {
        if (!scrollAreaRef.current) return

        scrollAreaRef.current.scrollTo({ left: 0, top: 0 })
    }, [query])

    function closeDrawer() {
        setReactionDrawerOpenState(false);
    }

    const renderedCategories = useMemo(() => ALL_REACTION_CATEGORIES.map((categoryName) => {
        const reactions = (() => {
            if (!showCustomReactions && categoryName === 'custom') return
            if (categoryName === 'custom') return customReactions.data?.data
            if (categoryName === 'frequent') return frequentlyUsedReactions

            return data?.categories
                .find((category) => category.id === categoryName)
                ?.emojis.map((emojiId) => {
                    const emoji = data?.emojis[emojiId]

                    if (!emoji) return undefined

                    // @ts-ignore - emoji-mart types are incomplete for custom skins
                    const skin = emoji.skins[0] as any
                    const base = {
                        id: emoji.id,
                        name: emoji.name,
                        native: skin?.native,
                    }

                    if (skin?.src) {
                        return {
                            ...base,
                            file_url: skin.src
                        }
                    }

                    return base
                })
                .filter(notEmpty)
        })()

        if (!reactions || !reactions.length) return null

        return (
            <MobileReactionPickerCategory
                key={categoryName}
                id={categoryName}
                reactions={reactions}
                onReactionSelect={handleReactionSelect}
            />
        )
    }), [showCustomReactions, customReactions.data?.data, frequentlyUsedReactions, data, handleReactionSelect])

    return (
        <Drawer open={localOpen} onOpenChange={closeDrawer} repositionInputs={false}>
            <DrawerContent className="bottom-0 left-0 right-0 p-4">
                <DrawerHeader className='hidden'>
                    <DrawerTitle></DrawerTitle>
                    <DrawerDescription></DrawerDescription>

                </DrawerHeader>
                <div className='relative flex w-full flex-col focus:outline-none'>
                    <div className='px-safe-offset-3 pt-3'>
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder='Search'
                            className='h-10 rounded-lg border-transparent bg-muted px-3 text-base focus-visible:bg-background'
                        />
                    </div>
                    <div
                        ref={scrollAreaRef}
                        className='scrollbar-hide pb-safe-offset-2 flex flex-row overflow-y-hidden overflow-x-scroll'
                    >
                        {query ? (
                            <MobileReactionPickerCategory
                                id={query ? 'search' : 'frequent'}
                                reactions={query ? reactionSearchResults : frequentlyUsedReactions}
                                onReactionSelect={handleReactionSelect}
                            />
                        ) : (
                            renderedCategories
                        )}
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
}