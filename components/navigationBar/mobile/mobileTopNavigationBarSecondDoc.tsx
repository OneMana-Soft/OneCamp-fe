"use client"

import {usePathname} from "next/navigation";
import { Star } from "@/lib/icons";
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
import {ChatUserEmojiStatus} from "@/components/chat/chatUserEmojiStatus";
import {openUI} from "@/store/slice/uiSlice";
import type {DocInfoResponse} from "@/types/doc";

export function MobileTopNavigationBarSecondDoc({docId}:{docId: string}) {

    const docInfo = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');
    const dispatch = useDispatch();

    return (
        <div className='flex justify-center  px-2' >

            <div className='font-medium flex justify-center items-center space-x-3 text-lg text-center'>

                            <div onClick={()=>{dispatch(openUI({ key: 'otherUserProfile', data: { userUUID: docInfo.data?.data.doc_created_by.user_uuid } }))}} className='shrink-0'>
{docInfo.data?.data.doc_title}</div>
            </div>

        </div>

    );
}