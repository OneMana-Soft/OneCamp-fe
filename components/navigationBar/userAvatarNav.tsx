"use client"

import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import { memo } from "react";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import {getNameInitials} from "@/lib/utils/format/getNameIntials";
import {getAvatarFallbackClass} from "@/lib/utils/getAvatarColor";
import {cn} from "@/lib/utils/helpers/cn";
import {USER_STATUS_ONLINE} from "@/types/user";
import {useUserInfoState} from "@/hooks/useUserInfoState";

interface UserAvatarNavProp {
    toolTipString?: string
    userProfileObjKey?: string
    userName?: string
    isOnline?: boolean
    userUUID?: string
}

export const UserAvatarNav = memo(({toolTipString, userProfileObjKey, userName, isOnline: manualIsOnline, userUUID}: UserAvatarNavProp) => {

    const userStatusState = useUserInfoState(userUUID);
    const {src: imageSrc} = useUserAvatar(userProfileObjKey);

    const nameInitial = getNameInitials(userName);

    const isOnline = manualIsOnline ?? (userStatusState?.status === USER_STATUS_ONLINE && (userStatusState?.deviceConnected || 0) > 0);

    return (
        <Tooltip >
            <TooltipTrigger asChild>
                <div className="relative w-fit h-fit">
                    <Avatar className='h-8 w-8 hover:cursor-pointer' >
                        <AvatarImage src={imageSrc}/>
                        <AvatarFallback className={cn("text-xs font-semibold", getAvatarFallbackClass(userName))}>{nameInitial}</AvatarFallback>
                    </Avatar>
                    {isOnline && <span data-presence="" className="presence-dot [--presence-ring:var(--frame)]" />}
                </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-4">
                {toolTipString &&
                        <span className="ml-auto">
                    {toolTipString}
                  </span>

                }

            </TooltipContent>
        </Tooltip>

    )

})

UserAvatarNav.displayName = "UserAvatarNav"