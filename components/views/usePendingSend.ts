"use client"

import { useCallback, useMemo, useRef } from "react"
import { useDispatch, useStore } from "react-redux"
import type { UnknownAction } from "@reduxjs/toolkit"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { AxiosRequestConfig } from "axios"
import type { PostEndpointUrl } from "@/services/endPoints"
import type { RootState } from "@/store/store"
import type { Draft } from "@/lib/chat/unsentMessage"
import type { PendingSendActions } from "@/components/message/sendStatus"

/**
 * How a send that is already on screen asks the server: its row says what
 * happened, so no error toast on top of it and no loading bar across the top.
 */
export const SEND_QUIETLY = { ...OWN_ERRORS, silent: true } as AxiosRequestConfig

/**
 * Whether the conversation is parked on an older message from a link to it
 * (?postId= in a channel, ?messageId= in a DM), so its latest messages are not
 * loaded and there is nowhere yet to show a new one.
 */
export function viewingLinkedMessage(param: "postId" | "messageId"): boolean {
    return typeof window !== "undefined" && !!new URLSearchParams(window.location.search).get(param)
}

/**
 * How one kind of conversation (channel, DM, group) sends a message it shows
 * at once (lib/chat/pendingSend): which request, which store actions, and how
 * to read a pending message back for Try again and Edit.
 */
export interface PendingSendConfig<M, P, R> {
    endpoint: PostEndpointUrl
    /** Shows the message, marked as sending. */
    add: (message: M) => UnknownAction
    /** The server has it: its id and time, from its answer. */
    confirm: (localId: string, res: R | undefined) => UnknownAction
    fail: (localId: string) => UnknownAction
    retry: (localId: string) => UnknownAction
    remove: (localId: string) => UnknownAction
    /** The pending message, as the store holds it now. */
    find: (state: RootState, localId: string) => M | undefined
    /** The request that sends it. */
    payloadOf: (message: M) => P
    /** What goes back in the message box for Edit. */
    draftOf: (message: M) => Draft
    restore: (draft: Draft) => UnknownAction
    /** After the server has it (a sidebar preview, a fresh latest page). */
    onSent?: (message: M, res: R | undefined) => void
}

/**
 * Sends a message that is already on screen, and what can be done with it if
 * it does not go: Try again, Edit (back into the message box) and Delete.
 *
 * The request goes through the API client directly rather than usePost: that
 * hook's submitting flag re-rendered the whole conversation view twice a send,
 * and a failure here is said beside the message rather than in a toast.
 */
export function usePendingSend<M, P, R>(config: PendingSendConfig<M, P, R>) {
    const dispatch = useDispatch()
    const store = useStore<RootState>()
    const latest = useRef(config)
    latest.current = config

    const post = useCallback(
        (localId: string, message: M) => {
            const c = latest.current
            axiosInstance.post(c.endpoint, c.payloadOf(message), SEND_QUIETLY).then(
                (response) => {
                    const res = (response?.data?.data ?? response?.data) as R | undefined
                    dispatch(latest.current.confirm(localId, res))
                    latest.current.onSent?.(message, res)
                },
                () => dispatch(latest.current.fail(localId)),
            )
        },
        [dispatch],
    )

    const send = useCallback(
        (localId: string, message: M) => {
            dispatch(latest.current.add(message))
            post(localId, message)
        },
        [dispatch, post],
    )

    const retry = useCallback(
        (localId: string) => {
            const message = latest.current.find(store.getState(), localId)
            if (!message) return
            dispatch(latest.current.retry(localId))
            post(localId, message)
        },
        [dispatch, post, store],
    )

    const edit = useCallback(
        (localId: string) => {
            const message = latest.current.find(store.getState(), localId)
            if (!message) return
            dispatch(latest.current.restore(latest.current.draftOf(message)))
            dispatch(latest.current.remove(localId))
        },
        [dispatch, store],
    )

    const discard = useCallback((localId: string) => void dispatch(latest.current.remove(localId)), [dispatch])

    const actions = useMemo<PendingSendActions>(() => ({ retry, edit, discard }), [retry, edit, discard])
    return { send, actions }
}
