"use client"

import {useDispatch, useSelector} from "react-redux";
import {useCallback, useMemo} from "react";
import {RootState} from "@/store/store";
import {setFrequentReactionIdsMap, setLastUsedReactionId} from "@/store/slice/reactionSlice";
import {useReactionsData} from "@/hooks/reactions/useReactionsData";
import {notEmpty} from "@/lib/utils/validation/notEmpty";
import {DEFAULT_FREQUENT_REACTIONS, MAX_FREQUENT_RESULTS} from "@/types/reaction";
import {formatReactionData} from "@/lib/utils/reaction/formatReaction";
import {isStandardReaction} from "@/lib/utils/reaction/checker";
import {noteReaction} from "@/lib/chat/recentReactions";

export function useAddFrequentlyUsedReaction() {
    const dispatch = useDispatch()
    const frequentReactionIdsMap = useSelector((state: RootState) =>
        state.reaction.frequentReactionIdsMap
    )

    // Given the whole reaction where it is known, it is also one of the
    // recent ones a message's quick reactions offer (lib/chat/recentReactions).
    const addReactionIdToFrequents = useCallback(
        (reaction: { id: string; native?: string; name?: string }) => {
            const { id } = reaction
            noteReaction(reaction)
            const newFrequentIds = frequentReactionIdsMap ? { ...frequentReactionIdsMap } : {}
            newFrequentIds[id] = newFrequentIds[id] ? newFrequentIds[id] + 1 : 1

            dispatch(setLastUsedReactionId(id))
            dispatch(setFrequentReactionIdsMap(newFrequentIds))
        },
        [dispatch, frequentReactionIdsMap]
    )

    return {
        addReactionIdToFrequents
    }
}

export function useFrequentlyUsedReactions({ hideCustomReactions }: { hideCustomReactions?: boolean } = {}) {
    const dispatch = useDispatch()
    const reactionsData = useReactionsData()

    const lastUsedReactionId = useSelector((state: RootState) =>
        state.reaction.lastUsedReactionId
    )
    const frequentReactionIdsMap = useSelector((state: RootState) =>
        state.reaction.frequentReactionIdsMap
    )

    const frequentlyUsedReactions = useMemo(() => {
        const newFrequentIds = frequentReactionIdsMap ? { ...frequentReactionIdsMap } : {}

        const reactions = Object.keys(newFrequentIds)
            .sort((a, b) => {
                const aScore = newFrequentIds[b]
                const bScore = newFrequentIds[a]
                if (aScore === bScore) return a.localeCompare(b)
                return aScore - bScore
            })
            .map((id) => reactionsData?.reactions[id])
            .filter(notEmpty)
            .map(formatReactionData)
            .filter((reaction) => hideCustomReactions ? isStandardReaction(reaction) : true)

        if (reactions.length < DEFAULT_FREQUENT_REACTIONS.length) {
            const defaultReactionsNotInList = DEFAULT_FREQUENT_REACTIONS.filter(
                (defaultId) => !reactions.some((reaction) => reaction.id === defaultId)
            )

            return [
                ...reactions,
                ...defaultReactionsNotInList
                    .map((id) => reactionsData?.reactions[id])
                    .filter(notEmpty)
                    .map(formatReactionData)
            ]
        }

        if (reactions.length <= MAX_FREQUENT_RESULTS) return reactions

        reactions.slice(MAX_FREQUENT_RESULTS).forEach(({ id }) => {
            if (id !== lastUsedReactionId) delete newFrequentIds[id]
        })

        const trimmedReactions = reactions.slice(0, MAX_FREQUENT_RESULTS)
        const indexOfLastUsedReaction = trimmedReactions.findIndex(({ id }) => id === lastUsedReactionId)

        if (lastUsedReactionId && indexOfLastUsedReaction === -1) {
            const leastFrequentReaction = trimmedReactions[MAX_FREQUENT_RESULTS - 1]
            delete newFrequentIds[leastFrequentReaction.id]
            newFrequentIds[lastUsedReactionId] = 1
        }

        dispatch(setFrequentReactionIdsMap(newFrequentIds))
        return trimmedReactions
    }, [dispatch, frequentReactionIdsMap, hideCustomReactions, lastUsedReactionId, reactionsData?.reactions])

    return {
        frequentlyUsedReactions
    }
}
