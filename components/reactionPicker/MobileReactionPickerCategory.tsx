"use client"

import {getReactionCategoryLabel, StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {MobileReactionPickerProps} from "@/components/drawers/emojiPickerDrawer";
import {isStandardReaction} from "@/lib/utils/reaction/checker";
import Image from 'next/image'
import React from 'react'


interface MobileReactionPickerCategoryProps {
    id: string
    reactions: (StandardReaction | SyncCustomReaction)[]
    onReactionSelect: MobileReactionPickerProps['onReactionSelect']
}

/**
 * One group of the phone's emoji picker (mobile.md K4): its name, then a grid
 * of 44px cells, as many across as the sheet holds, each a 30px emoji that
 * grows as the finger presses it. The groups follow one another down the
 * sheet's one scroller; a group off screen is neither laid out nor drawn
 * (content-visibility) until it nears, so the ~1,900 cells cost nothing up
 * front.
 */
export const MobileReactionPickerCategory = React.memo(function MobileReactionPickerCategory({ id, reactions, onReactionSelect }: MobileReactionPickerCategoryProps) {
    const label = getReactionCategoryLabel(id)
    return (
        <section data-emoji-group={id} aria-label={label} className="[contain-intrinsic-size:auto_360px] [content-visibility:auto]">
            <h3 className="px-1.5 pb-1 pt-3 text-meta font-medium text-ink-3">{label}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))]">
                {reactions.map((reaction) => (
                    <button
                        type="button"
                        key={reaction.id}
                        onClick={() => onReactionSelect(reaction)}
                        className="group flex h-11 items-center justify-center rounded-[10px] transition-colors duration-[120ms] active:bg-press"
                    >
                        {isStandardReaction(reaction) ? (
                            <span className='font-["emoji"] text-3xl leading-none transition-transform duration-[90ms] ease-[var(--ix-ease)] motion-safe:group-active:scale-[1.25]'>
                                {reaction.native}
                            </span>
                        ) : (reaction as SyncCustomReaction).file_url ? (
                            <Image
                                className="size-7 object-contain"
                                src={(reaction as SyncCustomReaction).file_url!}
                                alt={(reaction as SyncCustomReaction).name}
                                width={28}
                                height={28}
                                loading="lazy"
                            />
                        ) : null}
                    </button>
                ))}
            </div>
        </section>
    )
})
