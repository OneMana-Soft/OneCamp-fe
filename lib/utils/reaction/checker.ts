import {StandardReaction, SyncCustomReaction} from "@/types/reaction";

export function isStandardReaction(reaction: StandardReaction | SyncCustomReaction): reaction is StandardReaction {
    return !('file_url' in reaction)
}