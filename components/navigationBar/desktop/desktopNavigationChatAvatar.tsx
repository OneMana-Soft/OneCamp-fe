import {USER_STATUS_ONLINE,  UserProfileDataInterface} from "@/types/user";
import React from "react";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import {getNameInitials} from "@/lib/utils/format/getNameIntials";
import {getAvatarFallbackClass} from "@/lib/utils/getAvatarColor";
import {cn} from "@/lib/utils/helpers/cn";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import { statusColors } from "@/lib/colors";

export const DesktopNavigationChatAvatar = ({userInfo}: {userInfo?: UserProfileDataInterface}) => {

    const userStatusState = useUserInfoState(userInfo?.user_uuid)

    const profileKey = userStatusState?.userName ? userStatusState.profileKey : userInfo?.user_profile_object_key
    const {src: imageSrc} = useUserAvatar(profileKey);

    const nameInitial = getNameInitials(userInfo?.user_name);


    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status? userStatusState.status : (userInfo?.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (userInfo?.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;


    return (
        <div className='relative'>
            <Avatar className='h-7 w-7 md:h-5 md:w-5 hover:cursor-pointer' >
                <AvatarImage src={imageSrc}/>
                <AvatarFallback className={cn("text-[9px] md:text-[8px] font-semibold", getAvatarFallbackClass(userInfo?.user_name))}>{nameInitial[0]}</AvatarFallback>
            </Avatar>
            {isOnline && <div className={`h-2.5 w-2.5 md:h-2 md:w-2 ring-[1px] ring-background rounded-full ${statusColors.online.solid} absolute bottom-0 right-0`}></div>}

        </div>
    )
}