interface preSelectedEmojiInterface {
    emojiId: string
    emojiString: string
    /**
     * What the reaction is called, for the button that applies it.
     *
     * A screen reader given only the character announces whatever its emoji
     * table says, which for "+1" is not "thumbs up" and for several of these is
     * nothing at all. The id is a slug ("confetti_ball", "+1") and reads as one.
     * Naming them here means the ten places that render this row do not each
     * invent a name, or skip it.
     */
    emojiName: string
}

export const preSelectedEmojis: preSelectedEmojiInterface[] = [
    {
        emojiId: 'confetti_ball',
        emojiString: '🎊',
        emojiName: 'celebrate'
    },
    {
        emojiId: '+1',
        emojiString: '👍',
        emojiName: 'thumbs up'
    },
    {
        emojiId: 'clap',
        emojiString: '👏',
        emojiName: 'clap'
    },
    {
        emojiId: 'smile',
        emojiString: '😄',
        emojiName: 'smile'
    },
    {
        emojiId: 'joy',
        emojiString: '😂',
        emojiName: 'laugh'
    }
]
