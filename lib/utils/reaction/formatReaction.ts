import {isStandardReactionSkin, ReactionDataInterface, StandardReaction, SyncCustomReaction} from "@/types/reaction";

export function formatReactionData(reactionData: ReactionDataInterface): StandardReaction | SyncCustomReaction {
    const skin = reactionData.skins[0]

    if (isStandardReactionSkin(skin)) {
        return {
            id: reactionData.id,
            name: reactionData.name,
            native: skin.native
        }
    }

    return {
        id: reactionData.id,
        name: reactionData.name,
        file_url: skin.file_url,
        created_at: skin.created_at
    }
}