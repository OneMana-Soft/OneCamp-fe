"use client"

import { useMemo, type ComponentType } from "react"
import { useDispatch, useStore } from "react-redux"
import type { UnknownAction } from "@reduxjs/toolkit"
import { useSWRConfig } from "swr"
import { useMedia } from "@/context/MediaQueryContext"
import { ScheduleSendContext, type ScheduleKind } from "@/context/ScheduleSendContext"
import { PendingSendContext } from "@/components/message/sendStatus"
import { SEND_QUIETLY, usePendingSend, viewingLinkedMessage, type PendingSendConfig } from "@/components/views/usePendingSend"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { useScheduleMessage } from "@/hooks/useScheduledMessages"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { useComposeOnArrival } from "@/hooks/useComposeOnArrival"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useInSplitPane } from "@/hooks/useLinkTarget"
import { useConversationMissing } from "@/hooks/useConversationMissing"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import { NOT_SENT_TOAST, type Draft } from "@/lib/chat/unsentMessage"
import { newLocalId } from "@/lib/chat/pendingSend"
import { claimFirstMessage, isFirstMessage } from "@/lib/chat/firstMessage"
import { appMutate } from "@/lib/swrMutate"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import type { RootState } from "@/store/store"
import type { MessageInputState } from "@/store/slice/channelSlice"
import type { UserProfileDataInterface, UserProfileInterface } from "@/types/user"

/** What a kind's computer and phone pages are given: the conversation's id first. */
export interface ConversationPageProps {
    id: string
    handleSend: (latestContent?: string) => boolean | void
    focusComposer: boolean
}

/** What a send posts: the words, the files, and the message it answers. */
export interface SendBody {
    html: string
    files: NonNullable<MessageInputState["filesUploaded"]>
    replyToUuid?: string
}

/**
 * One kind of conversation (chat A1 step 2): what the body needs that a
 * channel, a DM and a group each do their own way. Everything else, from the
 * missing state to the first message, is the body's, once.
 */
export interface ConversationKind<M, P extends object, R> {
    kind: "channel" | "dm" | "group"
    /** The conversation's own id: the channel's, the other person's, the group's. */
    id: string
    /** The missing state's words, and where its Back goes. */
    missing: { noun: string; back: { label: string; href: string }; noAccessDetail?: string }
    /** The newest page's key, refetched once a send lands. */
    latestKey: string
    /** The address's parameter when a message was opened by its link. */
    linkParam: "postId" | "messageId"
    /** The send in flight (components/views/usePendingSend), but for what follows a send. */
    pending: Omit<PendingSendConfig<M, P, R>, "onSent">
    /** The message box's draft, read when sending, and the action that empties it. */
    draftOf: (state: RootState) => MessageInputState
    clearDraft: UnknownAction
    /** The body a send or a send later posts. */
    bodyOf: (send: SendBody) => P
    /** The message as the list shows it while it sends. */
    sending: (localId: string, send: SendBody & { draft: MessageInputState; self: UserProfileDataInterface }) => M
    /** Whether the person signed in has a message among those held. */
    hasMine: (state: RootState, self: string) => boolean
    /** Send later's kind and target (hooks/useScheduledMessages). */
    schedule: { kind: ScheduleKind; target: string }
    /** Once a message is in the list, it is followed to the end. */
    afterSend: UnknownAction
    /** The kind's pages on a computer and a phone: components declared once, never made per render. */
    pages: { computer: ComponentType<ConversationPageProps>; phone: ComponentType<ConversationPageProps> }
}

const EMPTY: MessageInputState = { inputTextHTML: "", filesUploaded: [], filePreview: [] }

/**
 * A conversation's body (chat A1 step 2, the channel's first): its missing
 * state, the send in flight and send later, the first message's
 * celebration, and the kind's page on a computer or a phone. A kind supplies
 * only what is its own (ConversationKind).
 */
export function ConversationBody<M, P extends object, R>({ kind }: { kind: ConversationKind<M, P, R> }) {
    const { id, latestKey } = kind
    const scheduleMessage = useScheduleMessage()
    const { toast } = useToast()
    const dispatch = useDispatch()
    const store = useStore<RootState>()
    // Beside the page, the address's link is the main view's, never this one's (FE-BUG-12).
    const inPane = useInSplitPane()
    const { cache } = useSWRConfig()
    const { missing, retry, retrying } = useConversationMissing(kind.kind, id)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const { isMobile, isDesktop } = useMedia()
    // A new member lands here with the message box ready (lib/landing.ts).
    const focusComposer = useComposeOnArrival(id)

    // A message is in the conversation the moment Send is pressed (lib/chat/pendingSend).
    const { send, actions } = usePendingSend<M, P, R>({
        ...kind.pending,
        // The cached latest page has it next time the conversation opens.
        onSent: () => void appMutate(latestKey),
    })

    const sendBody = (draft: MessageInputState, latestContent?: string): SendBody | null => {
        // The editor's latest HTML (flushed by the input) over the store's copy,
        // which can lag a keystroke and drop the last character typed.
        const html = removeEmptyPTags(latestContent ?? draft.inputTextHTML)
        const files = draft.filesUploaded || []
        // Words, or files on their own: a message of only a photo is a message.
        if (html.length == 0 && files.length == 0) return null
        return { html, files, replyToUuid: draft.replyToUuid }
    }

    // Send later: the same body Send would post, handed to the scheduler.
    const handleSchedule = useStableCallback(async (latestContent: string | undefined, at: Date) => {
        const body = sendBody(kind.draftOf(store.getState()) || EMPTY, latestContent)
        if (!body) return false
        const ok = await scheduleMessage(kind.schedule.kind, kind.bodyOf(body) as Record<string, unknown>, at)
        if (ok) dispatch(kind.clearDraft)
        return ok
    })

    // Sends the message in the box. True when it is the sender's first message
    // here, which the composer celebrates (lib/chat/firstMessage).
    const handleSend = useStableCallback((latestContent?: string): boolean => {
        // The draft as it is now, read when sending rather than subscribed to:
        // the view re-rendered on every change to it while typing.
        const draft = kind.draftOf(store.getState()) || EMPTY
        const body = sendBody(draft, latestContent)
        if (!body) return false
        dispatch(kind.clearDraft)

        // Parked on an older message from a link, the latest messages aren't
        // loaded, so there is nowhere to show it yet: it is sent as it is, and
        // goes back in the box if it doesn't go.
        if (!inPane && viewingLinkedMessage(kind.linkParam)) {
            const unsent: Draft = { html: body.html, files: body.files, previews: draft.filePreview, replyToUuid: body.replyToUuid, replyToAuthorName: draft.replyToAuthorName, replyToText: draft.replyToText }
            axiosInstance.post(kind.pending.endpoint, kind.bodyOf(body), SEND_QUIETLY).then(() => void appMutate(latestKey), () => {
                dispatch(kind.pending.restore(unsent))
                toast(NOT_SENT_TOAST)
            })
            return false
        }

        // The sender's first message here: none of theirs among those held, and
        // the latest page from the server is all there is.
        const self = selfProfile.data?.data
        const page = cache.get(latestKey)?.data as { data?: { has_more?: boolean } } | undefined
        const first = !!self?.user_uuid && isFirstMessage({
            mine: kind.hasMine(store.getState(), self.user_uuid),
            wholeHistory: page?.data?.has_more === false,
        }) && claimFirstMessage(`${kind.kind}:${id}`)

        const localId = newLocalId()
        send(localId, kind.sending(localId, { ...body, draft, self: self || ({} as UserProfileDataInterface) }))
        dispatch(kind.afterSend)
        return first
    })

    const schedule = useMemo(() => ({ ...kind.schedule, schedule: handleSchedule }), [kind.schedule, handleSchedule])

    if (!id) return null

    // A conversation that isn't there, or isn't yours to read: one state on a
    // computer and a phone, with no header, Huddle, Join or message box (QA F-08).
    if (missing) {
        return (
            <LoadFailureState
                kind={missing}
                noun={kind.missing.noun}
                onRetry={() => void retry()}
                retrying={retrying}
                back={inPane ? undefined : kind.missing.back}
                noAccessDetail={kind.missing.noAccessDetail}
            />
        )
    }

    const { computer: Computer, phone: Phone } = kind.pages
    return (
        <PendingSendContext.Provider value={actions}>
            <ScheduleSendContext.Provider value={schedule}>
                {isMobile && <Phone id={id} handleSend={handleSend} focusComposer={focusComposer} />}
                {isDesktop && <Computer id={id} handleSend={handleSend} focusComposer={focusComposer} />}
            </ScheduleSendContext.Provider>
        </PendingSendContext.Provider>
    )
}
