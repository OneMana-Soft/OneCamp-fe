import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import type {UserEmojiInterface} from "@/store/slice/userSlice";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useMedia} from "@/context/MediaQueryContext";
import {useStatusIsExpired} from "@/hooks/useStatusIsExpired";


// One empty status for everyone without one: a fresh {} from the selector was
// a new value on every store change, so each DM row in the sidebar re-rendered
// on every dispatch.
const NO_STATUS: Partial<UserEmojiInterface> = {}

export const DesktopNavigationEmojiStatus = ({userUUID}: {userUUID: string}) => {

    const { isMobile } = useMedia();


    const userStatusState = useSelector((state: RootState) => state.users.usersStatus[userUUID] || NO_STATUS);

    /**
     * Drop expired statuses at render time. The BE doesn't publish a
     * delete event on auto-expiry, so a peer's expired emoji could
     * otherwise linger in Redux until the next profile fetch. The
     * hook re-evaluates every minute to sweep expired entries.
     */
    const cachedStatus = userStatusState.emojiStatus?.status_user_emoji_id
        ? userStatusState.emojiStatus
        : null
    const isExpired = useStatusIsExpired(cachedStatus)
    const activeStatus = cachedStatus && !isExpired ? cachedStatus : null

    // The emoji catalogue only for a status to draw (useEmojiMartData).
    const emojiData = useEmojiMartData(!!activeStatus?.status_user_emoji_id)
    const emojiInfo = findEmojiMartEmojiByEmojiID(emojiData.data, activeStatus?.status_user_emoji_id ?? '')

    const statusMessage = activeStatus?.status_user_emoji_desc ?? null

    if(!emojiInfo) return null


    return (
        <div className='flex'>
            <Tooltip >
                <TooltipTrigger asChild>

                    <div className='space-x-1'>
                            <span>{emojiInfo.skins[0].native}</span>
                    {isMobile &&
                        <span>{statusMessage}</span>
                    }
                    </div>

                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-4">

                        <span className="ml-auto">
                    {statusMessage ?? "Change status"}
                  </span>

                </TooltipContent>
            </Tooltip>
        </div>
    );
}