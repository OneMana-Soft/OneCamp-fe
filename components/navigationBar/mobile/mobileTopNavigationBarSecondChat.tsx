"use client"

import {usePathname} from "next/navigation";
import {MoreVertical, Star} from "lucide-react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {getStaticPaths} from "next/dist/build/templates/pages";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {ChannelInfoInterfaceResp} from "@/types/channel";
import {Button} from "@/components/ui/button";
import React, {useEffect, useState} from "react";
import {usePost} from "@/hooks/usePost";
import {USER_STATUS_ONLINE, UserEmojiStatus, UserProfileInterface} from "@/types/user";
import {ChatUserAvatar} from "@/components/chat/chatUserAvatar";
import {updateUserConnectedDeviceCount, updateUserEmojiStatus, updateUserStatus} from "@/store/slice/userSlice";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {openUI} from "@/store/slice/uiSlice";
import {ChatUserEmojiStatus} from "@/components/chat/chatUserEmojiStatus";

export function MobileTopNavigationBarSecondChat({chatUUID}:{chatUUID: string}) {

    const otherUserInfo  = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatUUID}`)

    const dispatch = useDispatch();

    const userStatusState = useUserInfoState(chatUUID);

    useEffect(() => {

        if(otherUserInfo.data?.data) {
            dispatch(updateUserEmojiStatus({userUUID: otherUserInfo.data?.data.user_uuid, status:otherUserInfo.data?.data.user_emoji_statuses?.[0] || {} as UserEmojiStatus}));
            dispatch(updateUserStatus({userUUID: otherUserInfo.data?.data.user_uuid, status:otherUserInfo.data.data.user_status || 'online'}));
            dispatch(updateUserConnectedDeviceCount({userUUID: otherUserInfo.data?.data.user_uuid, deviceConnected:otherUserInfo.data.data.user_device_connected || 0}));



        }

    }, [otherUserInfo.data?.data])


    const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
    const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (otherUserInfo.data?.data.user_status || 'offline');
    const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (otherUserInfo.data?.data.user_device_connected || 0);

    const isOnline = currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;
    return (
        <div className='flex justify-center px-2 relative items-center w-full h-full'>
            <div 
                className='font-bold flex justify-center items-center space-x-3 text-lg text-center cursor-pointer max-w-[80%]' 
                onClick={()=>{dispatch(openUI({ key: 'otherUserProfile', data: {userUUID:chatUUID} }))}}
            >
                <div className='relative flex-shrink-0'>
                    <ChatUserAvatar userName={userStatusState.userName  || otherUserInfo.data?.data.user_name}
                                    userProfileObjKey={userStatusState.profileKey || otherUserInfo.data?.data.user_profile_object_key}/>
                    {isOnline && <div className={`h-2.5 w-2.5 ring-[2px] ring-background rounded-full bg-green-500 absolute bottom-0 right-0`}></div>}
                </div>
                <div className={'truncate overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px] sm:max-w-[200px]'}>{userStatusState.userName || otherUserInfo.data?.data.user_name}</div>
                <div className='flex-shrink-0'>
                    <ChatUserEmojiStatus userUUID={chatUUID}/>
                </div>
            </div>
        </div>
    );
}