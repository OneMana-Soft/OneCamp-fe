"use client"

import { useState, type ReactNode } from "react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { AlarmClock, Bell, Copy, Forward, Languages, Link, ListTodo, MoreHorizontal, Pencil, Reply, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ACTION_TIP_END } from "@/components/MessageDesktopHover/actionTip"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import { reminderChoices } from "@/lib/utils/later"
import type { LaterTarget } from "@/components/later/SaveForLater"
import { useToast } from "@/hooks/use-toast"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"

interface MessageDesktopDropdownProps {
    setIsDropdownOpen: (open: boolean) => void
    getReplyNotification?: () => void
    /** Opens the task form drafted from this message. */
    onMakeTask?: () => void
    /** Arms the composer to reply to this message, quoting it. */
    onReply?: () => void
    onForward?: () => void
    onTranslate?: () => void
    /** Where the message lives, for Copy link. */
    link?: string
    /** Saving it to Later with a reminder. */
    laterTarget?: LaterTarget | null
    /** The message's words, for Copy text. */
    messageText?: string
    /** Save to memory, drawn by the AI module where it is available. */
    memorySlot?: ReactNode
    editMessage: () => void
    isAdmin?: boolean
    isOwner: boolean
    deleteMessage: () => void
    /** The trigger's class: the toolbar's 26px button. */
    triggerClassName?: string
}

const ITEM_ICON = "text-ink-3"

/** "Remind me ›": saves the message to Later with a reminder, one click a time. */
function RemindMeItems({ target }: { target: LaterTarget }) {
    const saved = useSavedEntry(target.itemType, target.itemId)
    const { save, remind } = useLaterActions()
    const now = new Date()
    const pick = (at: Date) =>
        void (saved
            ? remind(saved.id, at)
            : save({ item_type: target.itemType, item_id: target.itemId, link: target.link, title: target.title, context: target.context, remind_at: at.toISOString() })
        ).catch(() => {})
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <AlarmClock className={ITEM_ICON} aria-hidden="true" /> Remind me…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="pop-surface w-60 p-1">
                {reminderChoices(now).map((c) => (
                    <DropdownMenuItem key={c.key} onSelect={() => pick(c.at)}>
                        {c.label}
                        <DropdownMenuShortcut className="tabular-nums">{c.hint}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    )
}

/**
 * A message's More menu (design v3 chat, C20), in four groups: answering it
 * (reply with a quote, forward, copy link), keeping it (make a task, remind
 * me, save to memory, translate, copy text), following it, and changing it
 * (edit, delete). Delete asks in place, inside the menu ("Delete for
 * everyone?"), not in a dialog over the page. Destructive items are danger
 * ink, never a red fill.
 */
export default function MessageDesktopDropdown({
    isOwner,
    isAdmin,
    setIsDropdownOpen,
    getReplyNotification,
    onMakeTask,
    onReply,
    onForward,
    onTranslate,
    link,
    laterTarget,
    messageText,
    memorySlot,
    editMessage,
    deleteMessage,
    triggerClassName,
}: MessageDesktopDropdownProps) {
    const [confirming, setConfirming] = useState(false)
    const { toast } = useToast()
    const canDelete = isAdmin || isOwner

    const copy = (text: string, done: string) => {
        void navigator.clipboard?.writeText(text).then(
            () => toast({ title: done }),
            () => toast({ title: "Couldn't copy", variant: "destructive" }),
        )
    }

    const answering = Boolean(onReply || onForward || link)
    const keeping = Boolean(onMakeTask || laterTarget || memorySlot || onTranslate || messageText)

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (!open) setConfirming(false)
                setIsDropdownOpen(open)
            }}
        >
            {/* Labelled by a CSS tip (actionTip.ts): the toolbar this sits in is
                built on every hover, and a Radix tooltip here cost more than the
                menu's trigger itself. */}
            <DropdownMenuTrigger asChild>
                <Button aria-label="More actions" data-tip="More actions" variant="ghost" size="icon" className={cn("h-8 w-8", triggerClassName, ACTION_TIP_END)}>
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="pop-surface w-60 p-1" align="end">
                {answering && (
                    <DropdownMenuGroup>
                        {onReply && (
                            <DropdownMenuItem onSelect={onReply}>
                                <Reply className={ITEM_ICON} aria-hidden="true" /> Reply with quote
                            </DropdownMenuItem>
                        )}
                        {onForward && (
                            <DropdownMenuItem onSelect={onForward}>
                                <Forward className={ITEM_ICON} aria-hidden="true" /> Forward
                            </DropdownMenuItem>
                        )}
                        {link && (
                            <DropdownMenuItem onSelect={() => copy(new URL(link, window.location.origin).toString(), "Link copied")}>
                                <Link className={ITEM_ICON} aria-hidden="true" /> Copy link
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuGroup>
                )}
                {answering && keeping && <DropdownMenuSeparator />}
                {keeping && (
                    <DropdownMenuGroup>
                        {onMakeTask && (
                            <DropdownMenuItem onSelect={onMakeTask}>
                                <ListTodo className={ITEM_ICON} aria-hidden="true" /> Make a task
                            </DropdownMenuItem>
                        )}
                        {laterTarget && <RemindMeItems target={laterTarget} />}
                        {memorySlot}
                        {onTranslate && (
                            <DropdownMenuItem onSelect={onTranslate}>
                                <Languages className={ITEM_ICON} aria-hidden="true" /> Translate
                            </DropdownMenuItem>
                        )}
                        {messageText && (
                            <DropdownMenuItem onSelect={() => copy(htmlToPreviewText(messageText), "Text copied")}>
                                <Copy className={ITEM_ICON} aria-hidden="true" /> Copy text
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuGroup>
                )}
                {getReplyNotification && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={getReplyNotification}>
                            <Bell className={ITEM_ICON} aria-hidden="true" /> Get notified about replies
                        </DropdownMenuItem>
                    </>
                )}
                {(isOwner || canDelete) && (answering || keeping || getReplyNotification) && <DropdownMenuSeparator />}
                {isOwner && (
                    <DropdownMenuItem onSelect={editMessage}>
                        <Pencil className={ITEM_ICON} aria-hidden="true" /> Edit message
                    </DropdownMenuItem>
                )}
                {canDelete &&
                    (confirming ? (
                        <div role="group" aria-label="Delete this message?" data-delete-confirm="" className="animate-fade-in px-2 pb-1.5 pt-1">
                            <p className="text-ui-sm font-medium text-ink">Delete for everyone?</p>
                            <p className="mt-0.5 text-meta text-ink-3">It can&apos;t be undone.</p>
                            <div className="mt-2 flex justify-end gap-1.5">
                                <DropdownMenuItem asChild onSelect={(e) => { e.preventDefault(); setConfirming(false) }}>
                                    <Button size="xs" variant="ghost">
                                        Cancel
                                    </Button>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild onSelect={deleteMessage}>
                                    <Button size="xs" variant="destructive">
                                        Delete
                                    </Button>
                                </DropdownMenuItem>
                            </div>
                        </div>
                    ) : (
                        <DropdownMenuItem
                            className="text-danger-ink focus:text-danger-ink [&_svg]:text-danger-ink"
                            onSelect={(e) => {
                                // Ask here, in the menu, and keep it open.
                                e.preventDefault()
                                setConfirming(true)
                            }}
                        >
                            <Trash2 aria-hidden="true" /> Delete message
                        </DropdownMenuItem>
                    ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
