"use client";

import { memo, useCallback, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Forward, MessageSquareText } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";

import MessageDesktopDropdown from "@/components/MessageDesktopHover/MessageDesktopDropdown";
import { AddReactionTrigger } from "@/components/reactionPicker/AddReactionTrigger";


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
    messageText?: string;
    getReplyNotification?: () => void;
    setEmojiPopupState?: (open: boolean) => void;
    editMessage: () => void;
    deleteMessage: () => void;
    isAdmin?: boolean;
    isOwner: boolean;
    onReactionSelect: (id: string) => void;
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

const ICON_BUTTON_CLASS =
    "h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

interface HoverIconButtonProps {
    label: string;
    onClick: () => void;
    children: ReactNode;
}

const HoverIconButton = ({ label, onClick, children }: HoverIconButtonProps) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                onClick={onClick}
                className={ICON_BUTTON_CLASS}
            >
                {children}
            </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
    deleteMessage,
    editMessage,
    getReplyNotification,
    onReactionSelect,
    chatMessageID,
}: MessageDesktopHoverOptionProps) => {
    const dispatch = useDispatch();

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

    const showDropdown = Boolean(isAdmin || isOwner || getReplyNotification);

    return (
        <motion.div
            role="toolbar"
            aria-label="Message actions"
            initial={{ opacity: 0, y: -2, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={cn(
                "flex items-center gap-0.5 rounded-lg border border-border/60 p-1",
                "bg-background/85 shadow-overlay backdrop-blur-md",
                "supports-[backdrop-filter]:bg-background/70",
            )}
        >
            {QUICK_REACTIONS.map(({ id, emoji, label }) => (
                <Tooltip key={id}>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`React with ${label}`}
                            onClick={() => onReactionSelect(id)}
                            className={cn(
                                "h-8 w-8 rounded-md text-base leading-none",
                                "transition-transform duration-150 hover:scale-110 hover:bg-accent",
                            )}
                        >
                            <span aria-hidden="true">{emoji}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
            ))}

            <AddReactionTrigger
                onReactionSelect={onReactionSelect}
                showCustomReactions={false}
                setPopupState={setEmojiPopupState}
            />

            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border/70" />

            <HoverIconButton label="Reply in thread" onClick={handleOpenThread}>
                <MessageSquareText className="h-4 w-4" />
            </HoverIconButton>

            <HoverIconButton label="Forward" onClick={handleForward}>
                <Forward className="h-4 w-4" />
            </HoverIconButton>



            {showDropdown && (
                <MessageDesktopDropdown
                    isAdmin={isAdmin}
                    isOwner={isOwner}
                    setIsDropdownOpen={setIsDropdownOpen}
                    deleteMessage={deleteMessage}
                    editMessage={editMessage}
                    getReplyNotification={getReplyNotification}
                />
            )}
        </motion.div>
    );
};

export const MessageDesktopHoverOptionsForMainChatAndChannel = memo(
    MessageDesktopHoverOptionsForMainChatAndChannelComponent,
);
