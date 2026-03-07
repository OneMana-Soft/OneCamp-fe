
import React, {useState} from "react";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useMedia} from "@/context/MediaQueryContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"


import {UserEmojiInterface} from "@/store/slice/userSlice";

export const ChatUserEmojiStatus = ({userUUID}: {userUUID: string}) => {

    const emojiData = useEmojiMartData()
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    const { isMobile } = useMedia();

    const EMPTY_USER_STATUS = {} as UserEmojiInterface;

    const userStatusState = useSelector((state: RootState) => state.users.usersStatus[userUUID] || EMPTY_USER_STATUS );
    const emojiInfo = findEmojiMartEmojiByEmojiID(emojiData.data, userStatusState.emojiStatus?.status_user_emoji_id ?? '')

    const statusMessage =  userStatusState.emojiStatus?.status_user_emoji_desc ?? null


    if(!emojiInfo) return null


    if (isMobile) {
        return (
            <div className="flex">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <button
                            className="inline-flex items-center space-x-1 p-1 rounded-sm transition-colors hover:bg-gray-100 focus:outline-none "
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
                        <div
                            className="inline-flex items-center space-x-1 p-1 rounded-sm transition-colors hover:bg-gray-100 focus:outline-none "
                            tabIndex={0}
                            role="button"
                            aria-label={`User status: ${statusMessage}`}
                        >
              <span role="img" aria-label="Status emoji" className="text-sm">
                {emojiInfo.skins[0].native}
              </span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="flex items-center gap-2">
                        <span className="text-sm">{statusMessage}</span>
                    </TooltipContent>
                </Tooltip>
        </div>
    )
}
