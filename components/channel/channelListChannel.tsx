import React from "react";
import {ChatUserAvatar} from "@/components/chat/chatUserAvatar";
import {removeHtmlTags} from "@/lib/utils/removeHtmlTags";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {ChatUserListUserAvatar} from "@/components/chat/chatUserListUserAvatar";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {Hash} from "lucide-react";
import {app_channel_path} from "@/types/paths";
import {CallActiveIndicator} from "@/components/callIndicator/CallActiveIndicator";

interface DmItemProps {
    lastUsername: string;
    lastUserMessage: string;
    lastMessageTime: string;
    channelName: string;
    unseenMessageCount: number;
    userSelected: boolean
    attachmentCount: number
    isCallActive?: boolean
}

export const ChannelListChannel: React.FC<DmItemProps> = React.memo(({
                                                     lastUsername,
                                                     lastUserMessage,
                                                     lastMessageTime,
                                                     channelName,
                                                     unseenMessageCount,
                                                     userSelected,
                                                     attachmentCount,
                                                     isCallActive
                                                 }) => {





    let message = ''

    if(lastUserMessage == '' && attachmentCount > 0) {

        message = 'sent attachment'
    }

    if(lastUserMessage != '') {
        message = removeHtmlTags(lastUserMessage)
    }

    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);

    return (
        <div 
            className={`group flex items-start gap-4 p-4 border-b hover:cursor-pointer hover:bg-primary/10 hover:shadow-xl transition-all duration-200 w-full ${userSelected ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
        >
            {/* Channel Icon Section */}
            <div className="relative shrink-0 mt-0.5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-background shadow-sm transition-all ${userSelected ? "bg-primary text-primary-foreground" : "bg-muted group-hover:ring-muted"}`}>
                    <Hash className={`h-5 w-5 ${userSelected ? "text-primary-foreground" : "text-muted-foreground"}`} />
                </div>
                {unseenMessageCount !== 0 && (
                    <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                        {unseenMessageCount}
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="flex-1 space-y-1 overflow-hidden">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col overflow-hidden">
                        <div className="flex items-center">
                            <span className="font-semibold text-foreground leading-tight truncate mr-2">
                                {channelName}
                            </span>
                            {isCallActive && <CallActiveIndicator size="sm" />}
                        </div>
                        {lastUsername && (
                            <span className="text-xs text-muted-foreground/80 truncate">
                                last message by @{lastUsername}
                            </span>
                        )}
                    </div>
                    {lastMessageTime && (
                        <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                            {formatTimeForPostOrComment(lastMessageTime)}
                        </span>
                    )}
                </div>

                <div className={`text-sm text-foreground/80 leading-relaxed font-normal truncate p-2 rounded-md border border-border/20 group-hover:border-border/40 transition-colors ${userSelected ? "bg-primary/5 border-primary/20" : "bg-muted/10"}`}>
                    {message || "Start Conversation by saying Hi 👋"}
                </div>
            </div>
        </div>
    );
});

ChannelListChannel.displayName = "ChannelListChannel";
