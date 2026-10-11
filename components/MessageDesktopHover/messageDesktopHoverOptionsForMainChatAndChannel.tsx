"use client";

import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";

import { Button } from "@/components/ui/button";
import { MessageSquareText } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { ACTION_TIP } from "@/components/MessageDesktopHover/actionTip";

import MessageDesktopDropdown from "@/components/MessageDesktopHover/MessageDesktopDropdown";
import { AddReactionTrigger } from "@/components/reactionPicker/AddReactionTrigger";
import { SaveToMemoryButton } from "@/components/ai/SaveToMemoryButton";
import { SaveForLaterButton } from "@/components/later/SaveForLater";
import { messageLink } from "@/lib/utils/later";
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText";
import { makeTaskAction } from "@/lib/task/makeTaskAction";

import { openUI } from "@/store/slice/uiSlice";
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice";

interface MessageDesktopHoverOptionProps {
    setIsDropdownOpen: (open: boolean) => void;
    chatUUID?: string;
    groupUUID?: string;
    chatGrpID?: string;
    chatMessageID?: string;
    channelUUID?: string;
    postUUID?: string;
    /** A reply in a thread: what Save to memory records. */
    commentUUID?: string;
    messageText?: string;
    /** Who wrote it, shown beside the message in Later. */
    authorName?: string;
    // onReply, when provided, arms the composer to inline-reply to this message
    // (Discord-style). Distinct from "Reply in thread" (which opens the thread
    // panel). Rendered only when the surface supplies it.
    onReply?: () => void;
    // onTranslate, when provided, translates this message in place (the surface
    // owns the translation state + inline render).
    onTranslate?: () => void;
    getReplyNotification?: () => void;
    setEmojiPopupState?: (open: boolean) => void;
    editMessage: () => void;
    deleteMessage: () => void;
    isAdmin?: boolean;
    isOwner: boolean;
    onReactionSelect: (id: string) => void;
    /**
     * A reply inside a thread: there is no thread to open from it, and Reply
     * in thread gives way. The same toolbar otherwise, list and panel alike.
     */
    inThread?: boolean;
}

type QuickReaction = {
    readonly id: string;
    readonly emoji: string;
    readonly label: string;
};

const QUICK_REACTIONS: ReadonlyArray<QuickReaction> = [
    { id: "white_check_mark", emoji: "✅", label: "Mark as done" },
    { id: "eyes", emoji: "👀", label: "Take a look" },
    { id: "raised_hands", emoji: "🙌", label: "Nice work" },
];

/** The toolbar's buttons (design v3 chat, C19): 26px at r7, icons 16px in ink-3. */
export const TOOL_BUTTON =
    "size-[26px] rounded-[7px] p-0 text-ink-3 hover:bg-press hover:text-ink data-[state=open]:bg-press data-[state=open]:text-ink [&_svg]:size-4 [&_svg]:text-current focus-visible:outline-offset-[-2px]";

// A toolbar that appears as the pointer moves from one message to the next
// does not play its entrance again: one that blinks at every row while the
// eye scans down the conversation is noise (Campfire waits 150 ms for the
// same reason). It enters once, when the pointer arrives from outside.
let toolbarsShown = 0;
let lastToolbarHidden = -Infinity;
const RESHOW_MS = 300;

interface HoverIconButtonProps {
    label: string;
    onClick: () => void;
    children: ReactNode;
}

// Labelled by a CSS tip (actionTip.ts), not a Radix tooltip: the toolbar is
// built on every hover, and the tooltips were most of what that cost.
const HoverIconButton = ({ label, onClick, children }: HoverIconButtonProps) => (
    <Button type="button" variant="ghost" size="icon" aria-label={label} data-tip={label} onClick={onClick} className={cn(TOOL_BUTTON, ACTION_TIP)}>
        {children}
    </Button>
);

const MessageDesktopHoverOptionsForMainChatAndChannelComponent = ({
    groupUUID,
    chatGrpID,
    isOwner,
    isAdmin,
    setEmojiPopupState,
    setIsDropdownOpen,
    channelUUID,
    chatUUID,
    postUUID,
    messageText,
    authorName,
    deleteMessage,
    editMessage,
    getReplyNotification,
    onReply,
    onTranslate,
    onReactionSelect,
    chatMessageID,
    commentUUID,
    inThread = false,
}: MessageDesktopHoverOptionProps) => {
    const dispatch = useDispatch();
    // Decided once, as it mounts: arriving from outside, or from the row above.
    const [enters] = useState(
        () => toolbarsShown === 0 && (typeof performance === "undefined" || performance.now() - lastToolbarHidden > RESHOW_MS),
    );
    useEffect(() => {
        toolbarsShown += 1;
        return () => {
            toolbarsShown -= 1;
            lastToolbarHidden = performance.now();
        };
    }, []);

    const handleOpenThread = useCallback(() => {
        dispatch(
            openRightPanel({
                taskUUID: "",
                docUUID: "",
                chatMessageUUID: chatMessageID ?? "",
                postUUID: postUUID ?? "",
                channelUUID: channelUUID ?? "",
                chatUUID: chatUUID ?? "",
                groupUUID: groupUUID ?? "",
            }),
        );
    }, [dispatch, chatMessageID, postUUID, channelUUID, chatUUID, groupUUID]);

    const handleForward = useCallback(() => {
        dispatch(
            openUI({
                key: "forwardMessage",
                data: {
                    chatUUID: chatUUID ?? "",
                    chatMessageID: groupUUID ? "" : chatMessageID ?? "",
                    groupChatMsgID: groupUUID ? chatMessageID ?? "" : "",
                    channelUUID: channelUUID ?? "",
                    postUUID: postUUID ?? "",
                },
            }),
        );
    }, [dispatch, chatUUID, groupUUID, chatMessageID, channelUUID, postUUID]);

    // Save for later opens the message in its thread, where it is shown in full.
    const laterLink = messageLink({ channelUUID, postUUID, chatUUID, groupUUID, chatMessageID });

    // Make a task: the form opens drafted from this message, the task links
    // back to it, and a reply under it links to the task.
    const handleMakeTask = useCallback(() => {
        const action = makeTaskAction(
            { html: messageText, authorName, channelUUID, postUUID, chatUUID, groupUUID, chatMessageID },
            window.location.origin,
        );
        if (action) dispatch(action);
    }, [dispatch, messageText, authorName, channelUUID, postUUID, chatUUID, groupUUID, chatMessageID]);
    const onMakeTask = laterLink ? handleMakeTask : undefined;

    const laterID = postUUID || chatMessageID;
    const laterTarget = laterLink && laterID
        ? {
            itemType: (postUUID ? "post" : "chat") as "post" | "chat",
            itemId: laterID,
            link: laterLink,
            title: htmlToPreviewText(messageText) || "A message",
            context: authorName ? `From ${authorName}` : undefined,
        }
        : null;

    // Save to memory, in the More menu: channel posts, group chats and DMs,
    // wherever the memory layer has a scope and a source for it.
    const memorySlot = channelUUID && commentUUID ? (
        <SaveToMemoryButton asMenuItem messageText={messageText} channelUUID={channelUUID} sourceType="comment" sourceUUID={commentUUID} />
    ) : channelUUID && postUUID ? (
        <SaveToMemoryButton asMenuItem messageText={messageText} channelUUID={channelUUID} sourceType="post" sourceUUID={postUUID} />
    ) : (groupUUID || chatGrpID) && chatMessageID ? (
        <SaveToMemoryButton asMenuItem messageText={messageText} chatGrpID={groupUUID || chatGrpID} sourceType="chat" sourceUUID={chatMessageID} />
    ) : null;

    return (
        // A floating toolbar on the pop surface (design v3 chat, C19): r10 at
        // e3 with 3px of padding, six slots. It overlaps the row's top edge.
        // It enters by pop (y 2px and scale .98 to rest in 120 ms) when the
        // pointer arrives from outside, and not again row to row.
        <div
            role="toolbar"
            aria-label="Message actions"
            data-message-toolbar=""
            className={cn("pop-surface flex items-center gap-px rounded-[10px] p-[3px]", enters && "animate-toolbar-in")}
        >
            {QUICK_REACTIONS.map(({ id, emoji, label }) => (
                <Button
                    key={id}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`React with ${label}`}
                    data-tip={label}
                    onClick={() => onReactionSelect(id)}
                    className={cn(TOOL_BUTTON, "group/emoji text-base leading-none", ACTION_TIP)}
                >
                    <span aria-hidden="true" className="inline-block text-base transition-transform duration-[140ms] ease-out group-hover/emoji:scale-[1.15]">{emoji}</span>
                </Button>
            ))}

            <span aria-hidden="true" className="mx-[3px] h-4 w-px bg-line" />

            <AddReactionTrigger
                onReactionSelect={onReactionSelect}
                showCustomReactions={false}
                setPopupState={setEmojiPopupState}
                className={TOOL_BUTTON}
            />

            {!inThread && (
                <HoverIconButton label="Reply in thread" onClick={handleOpenThread}>
                    <MessageSquareText aria-hidden="true" />
                </HoverIconButton>
            )}

            {laterTarget && (
                <SaveForLaterButton target={laterTarget} onOpenChange={setIsDropdownOpen} className={TOOL_BUTTON} />
            )}

            <MessageDesktopDropdown
                isAdmin={isAdmin}
                isOwner={isOwner}
                setIsDropdownOpen={setIsDropdownOpen}
                deleteMessage={deleteMessage}
                editMessage={editMessage}
                getReplyNotification={getReplyNotification}
                onMakeTask={onMakeTask}
                onReply={onReply}
                onForward={postUUID || chatMessageID ? handleForward : undefined}
                onTranslate={onTranslate}
                link={laterLink || undefined}
                laterTarget={laterTarget}
                messageText={messageText}
                memorySlot={memorySlot}
                triggerClassName={TOOL_BUTTON}
            />
        </div>
    );
};

export const MessageDesktopHoverOptionsForMainChatAndChannel = memo(
    MessageDesktopHoverOptionsForMainChatAndChannelComponent,
);
