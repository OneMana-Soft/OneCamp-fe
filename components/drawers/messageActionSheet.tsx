"use client"

import * as React from "react"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useRouter } from "next/navigation"
import {
    AlarmClock,
    Bookmark,
    BookmarkCheck,
    Copy,
    Forward,
    Languages,
    Link,
    ListTodo,
    Loader2,
    MessageSquareText,
    Pencil,
    SmilePlus,
    Reply,
    Trash2,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { useTranslateText } from "@/services/aiService"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import { reminderChoices } from "@/lib/utils/later"
import type { LaterTarget } from "@/components/later/SaveForLater"
import { ChatFace } from "@/components/message/chatFace"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { feedback } from "@/lib/ui/feedback"
import { clockTime } from "@/lib/utils/date/clock"
import { noteReaction, quickReactions, readRecentReactions, type QuickReaction } from "@/lib/chat/recentReactions"
import { Button } from "@/components/ui/button"
import { DeleteConfirm } from "@/components/message/deleteConfirm"

/** The message the sheet acts on, drawn lifted above it (C61). */
export interface MessageSheetPreview {
    name: string
    profileKey?: string
    userUUID?: string
    isBot?: boolean
    html: string
    createdAt: string
}

/**
 * The phone's six quick reactions until you have used six of your own: your
 * six most recent, as the desktop toolbar's three (lib/chat/recentReactions).
 */
export const SHEET_EMOJIS: readonly QuickReaction[] = [
    { id: "white_check_mark", native: "✅", label: "done" },
    { id: "eyes", native: "👀", label: "looking" },
    { id: "raised_hands", native: "🙌", label: "nice work" },
    { id: "rocket", native: "🚀", label: "rocket" },
    { id: "tada", native: "🎉", label: "celebrate" },
    { id: "+1", native: "👍", label: "thumbs up" },
]

export interface MessageActionSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    preview?: MessageSheetPreview | null
    /** The message's own thread, for Reply in thread and Copy link. */
    threadPath: string
    forwardPath?: string
    laterTarget?: LaterTarget | null
    onReply?: () => void
    onAddEmoji: () => void
    handleEmojiClick: (emojiId: string) => void
    makeTask?: () => void
    copyText: () => void
    editMessage: () => void
    deleteMessage: () => void
    isOwner?: boolean
    isAdmin?: boolean
    messageText?: string
}

function Tile({ icon: Icon, label, onClick, active }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; active?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex h-[72px] flex-1 flex-col items-center justify-center gap-1.5 rounded-[14px] bg-sunken text-ui-sm font-medium text-ink transition-colors active:bg-press",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
        >
            <Icon className={cn("size-[22px]", active ? "text-brand-text" : "text-ink-2")} />
            {label}
        </button>
    )
}

function Row({ icon: Icon, label, onClick, danger, busy, buttonRef }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; danger?: boolean; busy?: boolean; buttonRef?: React.Ref<HTMLButtonElement> }) {
    return (
        <button
            ref={buttonRef}
            type="button"
            onClick={onClick}
            className={cn(
                "flex h-12 w-full items-center gap-3 border-b border-line px-1 text-left text-ui last:border-b-0 active:bg-hover",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                danger ? "text-danger-ink" : "text-ink",
            )}
        >
            {busy ? <Loader2 className="size-[18px] animate-spin text-ink-3" /> : <Icon className={cn("size-[18px]", danger ? "text-danger-ink" : "text-ink-3")} />}
            {label}
        </button>
    )
}

/**
 * The phone's long-press sheet (design v3 chat, C61). The pressed message is
 * lifted above the sheet as a copy on the raised surface (iMessage's
 * pattern), so you see what you act on; the sheet is the shared one
 * (components/ui/drawer: the pop step at e4, 20px top corners, the 36×5
 * grabber and its one scrim, 32% ink with no blur): six recent reactions at
 * 44px and a "+", three 72px tiles (Reply in thread, Reply with quote, Save),
 * then 48px rows. Edit and Delete are yours only; Delete is in danger ink. A
 * light buzz marks the threshold where the phone has one. Reduced motion: it
 * simply appears.
 */
export function MessageActionSheet({
    open,
    onOpenChange,
    preview,
    threadPath,
    forwardPath,
    laterTarget,
    onReply,
    onAddEmoji,
    handleEmojiClick,
    makeTask,
    copyText,
    editMessage,
    deleteMessage,
    isOwner,
    isAdmin,
    messageText,
}: MessageActionSheetProps) {
    const router = useRouter()
    const copyToClipboard = useCopyToClipboard()
    const { translateText, isSubmitting: translating } = useTranslateText()
    const [translation, setTranslation] = React.useState<string | null>(null)
    // Delete asks here, in the sheet, as a computer's More menu does (SD-5).
    const [confirmingDelete, setConfirmingDelete] = React.useState(false)
    // The question takes the asking row's place, so the focus goes with it:
    // to its Cancel, and back to the row when it's cancelled. Left on the
    // removed row, a keyboard or a screen reader lost its place in the sheet.
    const cancelDeleteRef = React.useRef<HTMLButtonElement>(null)
    const deleteRowRef = React.useRef<HTMLButtonElement>(null)
    const askedDelete = React.useRef(false)
    React.useEffect(() => {
        if (confirmingDelete) cancelDeleteRef.current?.focus()
        else if (askedDelete.current && open) deleteRowRef.current?.focus()
        askedDelete.current = confirmingDelete
    }, [confirmingDelete, open])
    const saved = useSavedEntry(laterTarget?.itemType ?? "post", laterTarget?.itemId ?? "")
    const { save, remove } = useLaterActions()

    React.useEffect(() => {
        // The long press that opened the sheet (mobile F3: impact).
        if (open) feedback("impact")
        if (!open) {
            setTranslation(null)
            setConfirmingDelete(false)
        }
    }, [open])

    // Read as the sheet opens: the reaction you used last is first.
    const emojis = React.useMemo(() => (open ? quickReactions(readRecentReactions(), SHEET_EMOJIS, SHEET_EMOJIS.length) : SHEET_EMOJIS), [open])

    const close = () => onOpenChange(false)
    const then = (fn: () => void, delay = 0) => () => {
        close()
        if (delay) window.setTimeout(fn, delay)
        else fn()
    }

    const toggleSave = () => {
        if (!laterTarget) return
        close()
        const run = saved
            ? remove(saved.id)
            : save({ item_type: laterTarget.itemType, item_id: laterTarget.itemId, link: laterTarget.link, title: laterTarget.title, context: laterTarget.context, remind_at: null })
        run.catch(() => {})
    }
    const remindTomorrow = () => {
        if (!laterTarget) return
        close()
        const at = reminderChoices(new Date()).find((c) => c.key === "tomorrow")!.at
        const run = saved
            ? Promise.resolve()
            : save({ item_type: laterTarget.itemType, item_id: laterTarget.itemId, link: laterTarget.link, title: laterTarget.title, context: laterTarget.context, remind_at: at.toISOString() })
        run.catch(() => {})
    }
    const translate = async () => {
        const t = (messageText || "").trim()
        if (!t) return
        const res = await translateText(t, typeof navigator !== "undefined" ? navigator.language : "English")
        if (res?.translation) setTranslation(res.translation)
    }

    return (
        // The shared sheet (components/ui/drawer): its one scrim, which leaves the
        // page when a close is interrupted (the long-press sheet's own could
        // stay over it and take every tap), its grabber and its motion.
        <Drawer open={open} onOpenChange={onOpenChange} detent="medium" shouldScaleBackground={false}>
            <DrawerContent
                data-message-sheet=""
                aria-describedby={undefined}
                className="max-h-[80dvh]"
                above={preview && (
                    <div data-sheet-preview="" className="pointer-events-none absolute inset-x-3 bottom-full mb-3 animate-preview-lift rounded-2xl bg-raised p-3 shadow-e3">
                        <div className="flex items-start gap-2.5">
                            <ChatFace name={preview.name} profileKey={preview.profileKey} userUUID={preview.userUUID} isBot={preview.isBot} size={32} />
                            <div className="min-w-0 flex-1">
                                <div className="flex h-5 items-center gap-2">
                                    <span className="truncate text-ui font-semibold text-ink">{preview.name}</span>
                                    <span className="shrink-0 text-meta tabular-nums text-ink-3">{clockTime(preview.createdAt)}</span>
                                </div>
                                <p className="line-clamp-4 whitespace-pre-line text-body text-ink">{htmlToPreviewText(preview.html)}</p>
                            </div>
                        </div>
                    </div>
                )}
            >
                <DrawerTitle className="sr-only">Message actions</DrawerTitle>
                <div className="flex flex-col gap-4 px-4 pb-4 pt-3">
                    <div className="flex items-center justify-between">
                        {emojis.map((e) => (
                            <button
                                key={e.id}
                                type="button"
                                aria-label={`React with ${e.label}`}
                                onClick={then(() => {
                                    noteReaction(e)
                                    handleEmojiClick(e.id)
                                })}
                                className="flex size-11 items-center justify-center rounded-xl text-2xl transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-ring"
                            >
                                {e.native}
                            </button>
                        ))}
                        <button
                            type="button"
                            aria-label="Pick another reaction"
                            onClick={() => onAddEmoji()}
                            className="flex size-11 items-center justify-center rounded-xl bg-sunken text-ink-2 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            <SmilePlus className="size-5" />
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <Tile icon={MessageSquareText} label="Thread" onClick={then(() => router.push(threadPath))} />
                        {onReply && <Tile icon={Reply} label="Quote" onClick={then(onReply)} />}
                        {laterTarget && <Tile icon={saved ? BookmarkCheck : Bookmark} label={saved ? "Saved" : "Save"} active={!!saved} onClick={toggleSave} />}
                    </div>

                    <div className="flex flex-col">
                        <Row icon={Copy} label="Copy text" onClick={then(copyText)} />
                        <Row
                            icon={Link}
                            label="Copy link"
                            onClick={then(() => copyToClipboard.copy(`${window.location.protocol}//${window.location.host}${threadPath}`, "copied link"))}
                        />
                        {makeTask && <Row icon={ListTodo} label="Make a task" onClick={then(makeTask, 150)} />}
                        {laterTarget && !saved && <Row icon={AlarmClock} label="Remind me tomorrow morning" onClick={remindTomorrow} />}
                        {forwardPath && <Row icon={Forward} label="Forward" onClick={then(() => router.push(forwardPath))} />}
                        {!!(messageText || "").trim() && (
                            <Row icon={Languages} label={translating ? "Translating…" : translation ? "Translate again" : "Translate"} busy={translating} onClick={translate} />
                        )}
                        {isOwner && <Row icon={Pencil} label="Edit message" onClick={then(editMessage)} />}
                        {(isOwner || isAdmin) &&
                            (confirmingDelete ? (
                                <DeleteConfirm className="py-3">
                                    <Button ref={cancelDeleteRef} size="lg" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                                        Cancel
                                    </Button>
                                    <Button size="lg" variant="destructive" onClick={then(deleteMessage, 100)}>
                                        Delete
                                    </Button>
                                </DeleteConfirm>
                            ) : (
                                <Row icon={Trash2} label="Delete message" danger onClick={() => setConfirmingDelete(true)} buttonRef={deleteRowRef} />
                            ))}
                    </div>

                    {translation && (
                        <div className="rounded-[10px] bg-sunken px-3 py-2">
                            <p className="mb-0.5 flex items-center gap-1.5 text-meta font-medium text-ink-3">
                                <Languages className="size-3" /> Translated
                            </p>
                            <p className="whitespace-pre-line text-body text-ink">{translation}</p>
                        </div>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
