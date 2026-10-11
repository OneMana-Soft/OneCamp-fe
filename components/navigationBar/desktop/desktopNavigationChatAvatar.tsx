import { displayNameOf } from "@/lib/personName"
import {USER_STATUS_ONLINE,  UserProfileDataInterface} from "@/types/user";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import {getNameInitials} from "@/lib/utils/format/getNameIntials";
import {getAvatarFallbackClass} from "@/lib/utils/getAvatarColor";
import {cn} from "@/lib/utils/helpers/cn";
import {useUserInfoState} from "@/hooks/useUserInfoState";

export const DesktopNavigationChatAvatar = ({userInfo}: {userInfo?: UserProfileDataInterface}) => {

    const userStatusState = useUserInfoState(userInfo?.user_uuid)

    const profileKey = userStatusState?.userName ? userStatusState.profileKey : userInfo?.user_profile_object_key
    const {src: imageSrc} = useUserAvatar(profileKey);

    const nameInitial = getNameInitials(displayNameOf(userInfo));


    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status? userStatusState.status : (userInfo?.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (userInfo?.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;


    return (
        <div className='relative'>
            <Avatar className='h-7 w-7 md:h-5 md:w-5 hover:cursor-pointer' >
                <AvatarImage src={imageSrc}/>
                <AvatarFallback className={cn("text-3xs font-semibold", getAvatarFallbackClass(displayNameOf(userInfo)))}>{nameInitial[0]}</AvatarFallback>
            </Avatar>
            {isOnline && <span data-presence="" className="presence-dot [--presence-ring:var(--frame)]" />}

        </div>
    )
}