"use client"

import { useLayoutEffect, useRef } from "react"
import { useStableCallback } from "@/hooks/useStableCallback"
import { reconcileReplies } from "@/lib/chat/threadReplies"
import type { CommentInfoInterface } from "@/types/comment"

/**
 * Brings the server's answer for a thread into the store, once per answer.
 *
 * The six thread views (channel, DM and group, on desktop and on the phone)
 * each did this in an effect with a rule of its own, and the rules lost
 * replies: the desktop group thread took the answer only when it already held
 * replies, so a group thread opened fresh showed none; the phone's DM and
 * group threads took it again whenever their count differed from it, so a
 * reply just sent was replaced by the older answer and vanished; and every
 * one took the same answer again once its last reply was deleted, which
 * brought that reply back. Now each answer is reconciled once with what the
 * store holds (lib/chat/threadReplies.ts), before paint, so the thread never
 * shows a frame without the replies it is about to show.
 *
 * `askedAt` is when the request for the answer began (useFetch's
 * lastRequestStartedAt); without it an answer only adds and updates.
 */
export function useThreadReplies(
    answer: CommentInfoInterface[] | null | undefined,
    askedAt: number | undefined,
    stored: CommentInfoInterface[],
    seed: (replies: CommentInfoInterface[]) => void,
): void {
    const storedRef = useRef(stored)
    const appliedRef = useRef<CommentInfoInterface[] | null>(null)
    const write = useStableCallback(seed)

    // First, so the effect below reads this render's replies.
    useLayoutEffect(() => {
        storedRef.current = stored
    })

    useLayoutEffect(() => {
        if (!answer || appliedRef.current === answer) return
        appliedRef.current = answer
        const next = reconcileReplies(storedRef.current, answer, askedAt)
        if (next !== storedRef.current) write(next)
    }, [answer, askedAt, write])
}
