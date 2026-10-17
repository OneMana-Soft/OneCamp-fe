"use client"

/**
 * A doc's comment threads, for every surface that shows them (docs programme
 * B7): the panel beside the doc, the phone's comments and thread pages, the
 * margin and the highlights. One hook, so each surface says the same thing:
 *
 * - the threads (useThreads: one read and one live subscription per doc);
 * - who may do what: comment, moderate (remove anyone's comment);
 * - the doc's live topic, so a phone's comment pages, where the doc's page
 *   isn't mounted, update as the panel does (N33);
 * - a comment's edit, removal and reactions, by its id, each answering for
 *   itself and throwing with the server's message (errors are errors: N46).
 */
import { docAbilities, docLevelOf } from "@/lib/docs/abilities"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useCallback, useEffect, useMemo } from "react"
import { useDispatch } from "react-redux"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { GetEndpointUrl } from "@/services/endPoints"
import { docInfoKey } from "@/lib/docCache"
import { injectSlice } from "@/store/store"
import { commentChanged, resourceKey } from "@/store/slice/threadsSlice"
import {
    createDocCommentSlice,
    decrementDocCommentCount,
    incrementDocCommentCount,
} from "@/store/slice/createDocCommentSlice"
import { THREADS_TROUBLE, useThreads } from "@/components/threads/useThreads"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { ThreadBody, ThreadResource } from "@/components/threads/types"
import type { Anchor } from "@/lib/anchors/types"
import type { DocInfoResponse } from "@/types/doc"
import type { UserProfileInterface } from "@/types/user"
import * as comments from "./docCommentApi"

// The count the doc's header and the phone's app bar show (retired store's last part).
injectSlice(createDocCommentSlice)

export function useDocThreads(docId: string) {
    const dispatch = useDispatch()
    const resource = useMemo<ThreadResource | null>(() => (docId ? { kind: "doc", uuid: docId } : null), [docId])
    const t = useThreads(resource)
    // The doc's own answer, as its page asks for it: one cached answer for both.
    const doc = useFetch<DocInfoResponse>(docId ? docInfoKey(docId) : "", undefined, undefined, OWN_ERRORS)
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const info = doc.data?.data
    const me = self.data?.data

    // Live where the doc's page isn't: its comment and thread events come on its topic.
    useMqttTopic({ topic: info?.doc_mqtt_topic || "" })

    // The doc answers again after failing (restored from the trash, back
    // online): its threads are read again too.
    const { refresh, status } = t
    useEffect(() => {
        if (info && status === "error") void refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the doc's answer changes
    }, [info])

    // The Access Resolver's answer, as every surface reads it
    // (lib/docs/abilities): the level the doc's answer carries, never worked
    // out again here (docs incident, 14 Oct 2026).
    const level = docLevelOf(info)
    const canComment = !!info && !!me && docAbilities(level).comment
    // The server decides; any thread says, since it is one decision for the doc.
    const canModerate = t.threads.some((x) => x.can_moderate)
    const key = docId ? resourceKey("doc", docId) : ""

    const counted = useCallback((commentId: string) => dispatch(incrementDocCommentCount({ docId, commentId })), [dispatch, docId])

    const { create, reply: replyTo } = t
    const start = useCallback(
        async (anchor: Anchor, body: ThreadBody) => {
            const thread = await create(anchor, body)
            const first = thread.comments[0]?.comment_uuid
            if (first) counted(first)
            return thread
        },
        [create, counted],
    )

    const reply = useCallback(
        async (threadId: string, body: ThreadBody) => {
            const c = await replyTo(threadId, body)
            counted(c.comment_uuid)
            return c
        },
        [replyTo, counted],
    )

    const write = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
        try {
            return await fn()
        } catch (e) {
            throw new Error(apiErrorMessage(e, THREADS_TROUBLE))
        }
    }, [])

    const edit = useCallback(
        (commentId: string, html: string) =>
            write(async () => {
                await comments.editComment(commentId, html)
                dispatch(commentChanged({ kind: "edited", key, commentId, html, at: new Date().toISOString() }))
            }),
        [write, dispatch, key],
    )

    const remove = useCallback(
        (commentId: string) =>
            write(async () => {
                await comments.removeComment(docId, commentId)
                dispatch(commentChanged({ kind: "removed", key, commentId }))
                dispatch(decrementDocCommentCount({ docId, commentId }))
            }),
        [write, dispatch, key, docId],
    )

    /** Adds a reaction, or changes the person's own one to another emoji (its id given). */
    const react = useCallback(
        (commentId: string, emojiId: string, reactionId?: string) =>
            write(async () => {
                const id = await comments.reactToComment(commentId, emojiId, reactionId)
                if (!id || !me) return
                dispatch(
                    commentChanged({
                        kind: "reacted",
                        key,
                        commentId,
                        reactionId: id,
                        emojiId,
                        by: { user_uuid: me.user_uuid, user_name: me.user_name, user_profile_object_key: me.user_profile_object_key ?? "" },
                        at: new Date().toISOString(),
                    }),
                )
            }),
        [write, dispatch, key, me],
    )

    const unreact = useCallback(
        (commentId: string, reactionId: string) =>
            write(async () => {
                await comments.removeReaction(commentId, reactionId)
                dispatch(commentChanged({ kind: "unreacted", key, commentId, reactionId }))
            }),
        [write, dispatch, key],
    )

    // What a thread's card does, in one object that keeps its identity, so
    // the cards render again only when their own thread changes.
    const { resolve, reopen, reanchor, markRead } = t
    const actions = useMemo(
        () => ({ reply, resolve, reopen, reanchor, markRead, edit, remove, react, unreact, canModerate }),
        [reply, resolve, reopen, reanchor, markRead, edit, remove, react, unreact, canModerate],
    )

    const docError = doc.isError as { response?: { status?: number } } | undefined
    return {
        actions,
        ...t,
        start,
        reply,
        edit,
        remove,
        react,
        unreact,
        me,
        doc: info,
        canComment,
        /** The person's level on the doc, for saying why there is no box. */
        level,
        canModerate,
        isError: t.status === "error",
        // The server's own reason, when it gave one; else ErrorState's own
        // words (nothing lost, likely the connection) say it better.
        errorDetail: t.error && t.error !== THREADS_TROUBLE ? t.error : undefined,
        // In the trash (410): there's nothing to retry.
        isDeleted: docError?.response?.status === 410,
        /** Try again: the threads read again. */
        mutate: t.refresh,
    }
}

export type DocThreads = ReturnType<typeof useDocThreads>
export type ThreadActions = DocThreads["actions"]
