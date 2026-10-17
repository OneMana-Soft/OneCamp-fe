"use client"

import { useMemo } from 'react'

import {
    ReactionCategoryType,
    ReactionsCategory,
    ReactionsData,
} from '@/types/reaction'

import { useEmojiMartData } from '@/hooks/reactions/useEmojiMartData'

/**
 * The emoji the pickers offer: emoji-mart's, by its categories. A workspace's
 * own emoji aren't among them: there is no store of them, and the "Custom"
 * group asked for them with an empty address, so it never loaded.
 */
export function useReactionsData(): ReactionsData | null {
    const { data: emojiMartData } = useEmojiMartData()

    const aliases = useMemo(() => emojiMartData?.aliases ?? {}, [emojiMartData?.aliases])

    const categories: ReactionsCategory[] = useMemo(
        () =>
            (emojiMartData?.categories ?? []).map((category) => ({
                id: category.id as unknown as ReactionCategoryType,
                reactionIds: category.emojis
            })),
        [emojiMartData?.categories]
    )
    const { reactions, emoticons } = useMemo(() => {
        const reactions: ReactionsData['reactions'] = {}
        const emoticons: ReactionsData['emoticons'] = {}

        Object.values(emojiMartData?.emojis ?? {}).forEach((emoji) => {
            reactions[emoji.id] = {
                id: emoji.id,
                name: emoji.name,
                keywords: emoji.keywords,
                emoticons: emoji.emoticons ?? [],
                skins: emoji.skins
            }

            emoji.emoticons?.forEach((emoticon) => (emoticons[emoticon] = emoji.id))
        })

        return { reactions, emoticons }
    }, [emojiMartData?.emojis])

    if (!emojiMartData) return null

    return { aliases, categories, reactions, emoticons }
}
