import {EmojiMartData} from "@emoji-mart/data";


export function findEmojiMartEmojiByEmojiID(emojiMartData: EmojiMartData| null, emojiId: string) {
    if(!emojiMartData) return

    return Object.values(emojiMartData.emojis).find((emoji) => emoji.id === emojiId)
}
