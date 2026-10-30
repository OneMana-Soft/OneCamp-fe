"use client"

import { memo, useCallback, useRef, useState, type ReactNode } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { Content } from "@tiptap/react"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import type { ComposerAgent } from "@/components/textInput/composerTools"
import { useUndoSchedule } from "@/components/textInput/useUndoSchedule"
import { LazyCommandSurface as CommandSurface } from "@/components/command/LazyCommandSurface"
import { ComposerAIButton } from "@/components/ai/ComposerAIButton"
import { ComposerReplyPill } from "@/components/message/composerReplyPill"
import { ScheduledMessagesBar } from "@/components/messages/scheduledMessagesBar"
import UploadingAttachmentIcon from "@/components/attachmentIcon/uploadingAttachmentIcon"
import { PhoneComposerDrawer } from "@/components/textInput/phoneComposerDrawer"
import { useComposerTarget } from "@/components/conversation/ComposerHost"
import { useScheduleSend } from "@/context/ScheduleSendContext"
import { usePublishTyping } from "@/hooks/usePublishTyping"
import { useUploadFile } from "@/hooks/useUploadFile"
import { useStableCallback } from "@/hooks/useStableCallback"
import { celebrateFirstMessage } from "@/lib/chat/celebrateFirst"
import { adapterOf } from "@/lib/conversation/adapters"
import { isThread, type ConversationRef } from "@/lib/conversation/types"
import { SendHorizontal } from "@/lib/icons"
import { clearDraftReply, dropDraftFile, heldDraft, listIdOf, writeDraft, type BoxDraft } from "@/store/conversations"
import { openUI } from "@/store/slice/uiSlice"
import type { RootState } from "@/store/store"

export interface ComposerProps {
    /** Sends what's in the box. True when it was the sender's first message here, which the box celebrates (C60). */
    handleSend: (latestContent?: string) => boolean | void
    placeholder: string
    /** The phone's box: a sheet at the bottom of the screen that can be pulled up. */
    phone?: boolean
    autoFocus?: boolean
    /** Who "+" › Ask offers (a channel's agents, C42). */
    agents?: ComposerAgent[]
    /** What a send goes through before and after it goes, where a kind asks first (a channel's broadcast). */
    sendThrough?: (html: string, send: () => boolean | void) => void
    /** What sits above the box (a DM's starters, its held notifications), given the box's send and conversation. */
    above?: (send: (html: string) => void, conversation: ConversationRef) => ReactNode
}

/**
 * A conversation's message box (chat A1 step 2c): one for a channel, a DM
 * and a group, on a computer and a phone. It writes to the conversation its
 * host names (ComposerHost), so a box beside the page writes to the
 * conversation beside the page, its files included. It reads the draft
 * itself: it is the only part of a conversation that changes as someone
 * types, and the page drawing again doesn't draw it again.
 */
export const Composer = memo(function Composer(props: ComposerProps) {
    const target = useComposerTarget()
    // A thread's reply box is ThreadPanel's.
    if (!target || isThread(target)) return null
    return <ConversationComposer conversation={target} {...props} />
})

function ConversationComposer({ conversation, handleSend, placeholder, phone, autoFocus, agents, sendThrough, above }: ComposerProps & { conversation: ConversationRef }) {
    const dispatch = useDispatch()
    const scheduleSend = useScheduleSend()
    const uploadFile = useUploadFile()
    const draft = useSelector((state: RootState) => heldDraft(state, conversation))
    const { publishTyping } = usePublishTyping(conversation)
    const files = useRef<HTMLInputElement>(null)
    // Draft with AI opens from "+", ⌘J and the phone's tool strip (C45, C48); Undo takes back a schedule (C44).
    const [aiOpen, setAiOpen] = useState(false)
    // A phone's sheet: as tall as what it holds, or pulled up to fill the screen (PhoneComposerDrawer).
    const [expanded, setExpanded] = useState(false)
    const openAi = useCallback(() => setAiOpen(true), [])
    const undoSchedule = useUndoSchedule(scheduleSend?.target)

    // The same functions for the life of the box, so the editor's action row
    // (memoised in textInput) keeps its buttons as the box redraws.
    const send = useStableCallback((latestContent?: string) => {
        const go = () => {
            const sent = handleSend(latestContent)
            if (sent) celebrateFirstMessage()
            return sent
        }
        if (sendThrough) sendThrough(latestContent ?? draft.html, go)
        else go()
    })
    const write = useStableCallback((html: string) => void dispatch(writeDraft(conversation, html)))
    const onChange = useStableCallback((content: Content) => {
        publishTyping(content as string)
        write(content as string)
    })
    const upload = useStableCallback(async (picked: FileList | File[]) => {
        const valid = uploadFile.validateFiles(picked)
        if (valid.length > 0) await uploadFile.makeRequestToUploadToConversation(valid, conversation)
    })
    // Its own picker: a box beside the page picks files for the conversation beside the page.
    const pick = useStableCallback(() => files.current?.click())

    const box = (variant: "chat" | "phone", sheet?: { expanded: boolean; onExpandedChange: (open: boolean) => void }) => (
        <MinimalTiptapTextInput
            throttleDelay={300}
            autoFocus={autoFocus}
            attachmentOnclick={pick}
            onActionFiles={upload}
            variant={variant}
            expanded={sheet?.expanded}
            onExpandedChange={sheet?.onExpandedChange}
            agents={agents}
            output="html"
            content={draft.html}
            contentRevision={draft.restoredUnsent}
            placeholder={placeholder}
            editable={true}
            ButtonIcon={SendHorizontal}
            hasAttachments={draft.files.length > 0}
            buttonOnclick={send}
            onSchedule={scheduleSend?.schedule}
            editorClassName="focus:outline-none"
            onChange={onChange}
            onDraftWithAI={openAi}
            onUndoSchedule={undoSchedule}
            aiSlot={<ComposerAIButton open={aiOpen} onOpenChange={setAiOpen} getText={() => draft.html} onResult={write} />}
        >
            {variant === "chat" && <BoxFiles conversation={conversation} draft={draft} />}
        </MinimalTiptapTextInput>
    )
    // A command's answer that is a message goes out through this box (textInput takes COMMAND_POST for its surface).
    const commands = (
        <CommandSurface
            surfaceKey={listIdOf(conversation)}
            {...(conversation.kind === "channel" ? { channelId: conversation.id } : { dmGroupId: conversation.id })}
        />
    )
    const reply = draft.replyToUuid ? (
        <ComposerReplyPill authorName={draft.replyToAuthorName} text={draft.replyToText} onCancel={() => dispatch(clearDraftReply(conversation))} />
    ) : null
    const picker = <input type="file" ref={files} multiple className="hidden" onChange={(e) => {
        const picked = e.target.files
        if (picked?.length) void upload(Array.from(picked))
        e.target.value = ""
    }} />

    if (phone) {
        return (
            <>
                {above && <div className="px-3">{above(send, conversation)}</div>}
                {reply && <div className="px-3">{reply}</div>}
                <PhoneComposerDrawer expanded={expanded} onExpandedChange={setExpanded} answers={commands}>
                    {scheduleSend && <ScheduledMessagesBar target={scheduleSend.target} />}
                    {box("phone", { expanded, onExpandedChange: setExpanded })}
                    <div className="px-3">
                        <BoxFiles conversation={conversation} draft={draft} />
                    </div>
                    {picker}
                </PhoneComposerDrawer>
            </>
        )
    }
    return (
        <div>
            {above?.(send, conversation)}
            {commands}
            {reply}
            {scheduleSend && <ScheduledMessagesBar target={scheduleSend.target} />}
            {box("chat")}
            {picker}
        </div>
    )
}

/** The files in the box, uploading or done: each opens in the viewer once up, and comes out with its ×. */
function BoxFiles({ conversation, draft }: { conversation: ConversationRef; draft: BoxDraft }) {
    const dispatch = useDispatch()
    if (draft.previews.length === 0) return null
    const media = adapterOf(conversation).mediaUrl(conversation)
    const open = (key: string) => {
        const file = draft.files.find((f) => f.attachment_obj_key === key)
        if (file) dispatch(openUI({ key: "attachmentLightbox", data: { allMedia: draft.files, media: file, mediaGetUrl: media } }))
    }
    return (
        <div className="flex flex-wrap">
            {draft.previews.map((p) => (
                <UploadingAttachmentIcon
                    key={p.key}
                    fileName={p.fileName}
                    progress={p.progress}
                    fileKey={p.key}
                    removeFile={() => dropDraftFile(conversation, p.key).forEach((a) => dispatch(a))}
                    getUrl={p.uuid ? `${media}/${p.uuid}` : undefined}
                    attachmentOnCLick={() => p.progress === 100 && open(p.key)}
                    attachmentType={p.attachmentType}
                />
            ))}
        </div>
    )
}
