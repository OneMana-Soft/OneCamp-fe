
import React, {useState} from "react";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useMedia} from "@/context/MediaQueryContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"


import {UserEmojiInterface} from "@/store/slice/userSlice";
import {useStatusIsExpired} from "@/hooks/useStatusIsExpired";

export const ChatUserEmojiStatus = ({userUUID}: {userUUID: string}) => {

    const emojiData = useEmojiMartData()
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    const { isMobile } = useMedia();

    const EMPTY_USER_STATUS = {} as UserEmojiInterface;

    const userStatusState = useSelector((state: RootState) => state.users.usersStatus[userUUID] || EMPTY_USER_STATUS );

    /**
     * Auto-expiry guard.
     *
     * The BE never publishes an MQTT delete event when an emoji status
     * naturally expires (the row stays in Dgraph; the active-emoji
     * query just filters it out via `gt(expiry_at, $time)`). That
     * means a peer who already had the active emoji cached in Redux
     * will keep rendering it indefinitely until they re-fetch the
     * profile. This client-side check hides expired badges
     * immediately; the next profile fetch (which now correctly leaves
     * Redux alone for missing emoji fields) eventually trims the
     * cached row.
     *
     * The hook re-evaluates every minute to sweep up status that
     * expire while the tab is open.
     */
    const memberStatus = userStatusState.emojiStatus?.status_user_emoji_id
        ? userStatusState.emojiStatus
        : null
    const isExpired = useStatusIsExpired(memberStatus)

    const emojiInfo = findEmojiMartEmojiByEmojiID(emojiData.data, memberStatus?.status_user_emoji_id ?? '')

    const statusMessage = memberStatus?.status_user_emoji_desc ?? null

    if (!emojiInfo || isExpired) return null


    if (isMobile) {
        return (
            <div className="flex">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <button
                            className="inline-flex items-center space-x-1 p-1 rounded-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            aria-label={`User status: ${statusMessage}`}
                            onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setIsPopoverOpen(!isPopoverOpen)
                                }
                            }
                        >
              <span role="img" aria-label="Status emoji" className="text-sm">
                {emojiInfo.skins[0].native}
              </span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent  className="w-auto max-w-xs p-2" sideOffset={8} align="start">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{statusMessage}</span>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        )
    }

    // Desktop version with Tooltip
    return (
        <div className="flex">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            className="inline-flex items-center space-x-1 p-1 rounded-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            aria-label={`User status: ${statusMessage}`}
                        >
              <span role="img" aria-label="Status emoji" className="text-sm">
                {emojiInfo.skins[0].native}
              </span>
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="flex items-center gap-2">
                        <span className="text-sm">{statusMessage}</span>
                    </TooltipContent>
                </Tooltip>
        </div>
    )
}
