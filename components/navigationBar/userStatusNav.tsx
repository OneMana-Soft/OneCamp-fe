"use client"

import addEmojiIconSrc from "@/assets/addEmoji.svg";
import Image from 'next/image';
import {useDispatch, useSelector} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {Button} from "@/components/ui/button";
import {RootState} from "@/store/store";
import {useMemo} from "react";
import {useStatusIsExpired} from "@/hooks/useStatusIsExpired";

export function UserStatusNav({userUUID}: {userUUID: string}) {

    const dispatch = useDispatch();

    const emojiData = useEmojiMartData()

    // Use a memoized selector with custom equality to prevent unnecessary re-renders
    const userStatusState = useSelector(
        (state: RootState) => state.users.usersStatus[userUUID],
        // Custom equality function to prevent re-renders on object reference changes
        (prev, next) => {
            // If both are undefined, they're equal
            if (!prev && !next) return true;
            
            // If one is undefined and the other isn't, they're different
            if (!prev || !next) return false;
            
            // Compare the actual properties that matter for rendering
            return (
                prev.emojiStatus?.status_user_emoji_id === next.emojiStatus?.status_user_emoji_id &&
                prev.emojiStatus?.status_user_emoji_desc === next.emojiStatus?.status_user_emoji_desc &&
                prev.emojiStatus?.status_user_emoji_expiry_at === next.emojiStatus?.status_user_emoji_expiry_at &&
                prev.status === next.status &&
                prev.deviceConnected === next.deviceConnected
            );
        }
    );
    
    // Memoize the fallback to ensure stable reference when userStatusState is undefined
    const safeUserStatusState = useMemo(() => 
        userStatusState || { emojiStatus: undefined } as any,
        [userStatusState]
    );

    /**
     * Treat an expired status as "no status". The BE never publishes
     * an MQTT delete event when an emoji status auto-expires (the row
     * stays in Dgraph and is just filtered out of subsequent active-
     * status queries), so without a render-time guard a stale entry
     * sticks in Redux until the next profile fetch.
     */
    const cachedStatus = safeUserStatusState.emojiStatus?.status_user_emoji_id
        ? safeUserStatusState.emojiStatus
        : null
    const isExpired = useStatusIsExpired(cachedStatus)
    const activeStatus = cachedStatus && !isExpired ? cachedStatus : null

    const emojiInfo = findEmojiMartEmojiByEmojiID(emojiData.data, activeStatus?.status_user_emoji_id ?? '')

    const statusMessage = activeStatus?.status_user_emoji_desc ?? null

    return (
        <div className='flex'>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant='ghost'
                        // accessibilityLabel='Update status emoji'
                        className='group/emoji'
                        size={'icon'}
                        onClick={()=>{dispatch(openUI({ key: 'userStatusUpdate', data: { userUUID: '' } }))}}
                    >
                    { emojiInfo
                        ?
                        emojiInfo.skins[0].native
                        :<Image src={addEmojiIconSrc || "/placeholder.svg?height=24&width=24"} alt="Add Emoji" width={18} className='hover:cursor-pointer' height={18} />
                    }
                    </Button>
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