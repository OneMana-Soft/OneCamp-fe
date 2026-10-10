"use client"

import { useEffect, useState } from 'react'
import type { EmojiMartData } from '@emoji-mart/data'

let emojiMartData: EmojiMartData | null = null

/**
 * The emoji catalogue (about 420 KB of script), loaded the first time it is
 * needed. `needed` false leaves it unloaded: the top bar and the sidebar read
 * it only to draw somebody's status emoji, and asking for it unconditionally
 * put it on every page's first load, ahead of Home's greeting, for people
 * with no status at all.
 */
export function useEmojiMartData(needed = true) {
    const [data, setData] = useState<EmojiMartData | null>(emojiMartData)

    useEffect(() => {
        async function load() {
            const { default: data } = (await import('@emoji-mart/data')) as { default: EmojiMartData }

            emojiMartData = data
            setData(data)
        }

        if (emojiMartData) {
            // Loaded by someone else since this mounted.
            setData(emojiMartData)
            return
        }
        if (!needed) return
        load()
    }, [needed])

    return { data }
}