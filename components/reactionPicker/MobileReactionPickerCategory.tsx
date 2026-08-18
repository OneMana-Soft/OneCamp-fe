"use client"

import {getReactionCategoryLabel, StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {MobileReactionPickerProps} from "@/components/drawers/emojiPickerDrawer";
import {cn} from "@/lib/utils/helpers/cn";
import {isStandardReaction} from "@/lib/utils/reaction/checker";
import Image from 'next/image'
import React from 'react'


interface MobileReactionPickerCategoryProps {
    id: string
    reactions: (StandardReaction | SyncCustomReaction)[]
    onReactionSelect: MobileReactionPickerProps['onReactionSelect']
}

export const MobileReactionPickerCategory = React.memo(function MobileReactionPickerCategory({ id, reactions, onReactionSelect }: MobileReactionPickerCategoryProps) {
    return (
        <div
            className={cn(
                'h-[240px]',
                // These were *-safe-offset-* utilities from tailwind.config.ts,
                // which Tailwind v4 never loads without an `@config` directive —
                // so all four compiled to nothing and the first/last emoji column
                // sat flush against the screen edge in landscape.
                '[&:first-child>div]:pl-[calc(0.75rem+env(safe-area-inset-left))] [&:last-child>div]:pr-[calc(0.75rem+env(safe-area-inset-right))]',
                '[&:first-child>h2]:pl-[calc(1.25rem+env(safe-area-inset-left))] [&:last-child>h2]:pr-[calc(0.75rem+env(safe-area-inset-right))]'
            )}
        >
            <h2 className='sticky left-0 w-fit whitespace-nowrap px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                {getReactionCategoryLabel(id)}
            </h2>
            <div
                data-vaul-no-drag
                className='grid w-full grid-flow-col grid-rows-5 place-content-start items-center gap-x-1 pl-3'
            >
                {reactions.map((reaction) => (
                    <button
                        data-vaul-no-drag
                        key={reaction.id}
                        onClick={() => onReactionSelect(reaction)}
                        className='flex aspect-square h-10 w-10 shrink-0 items-center justify-center rounded-lg font-[emoji] text-3xl leading-none transition-colors active:bg-accent'
                    >
                        {isStandardReaction(reaction) ? (
                            <span>{reaction.native}</span>
                        ) : (
                            (reaction as SyncCustomReaction).file_url ? (
                                <Image
                                    data-vaul-no-drag
                                    className='h-7.5 w-7.5 object-contain'
                                    src={(reaction as SyncCustomReaction).file_url!}
                                    alt={(reaction as SyncCustomReaction).name}
                                    width={30}
                                    height={30}
                                    loading="lazy"
                                />
                            ) : null
                        )}
                    </button>
                ))}
            </div>
        </div>
    )
})
