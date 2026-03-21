"use client"

import {usePathname, useRouter} from "next/navigation";
import NextLink from "next/link";
import {UserStatusNav} from "@/components/navigationBar/userStatusNav";
import {UserAvatarNav} from "@/components/navigationBar/userAvatarNav";
import {useDispatch, useSelector} from "react-redux";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import {
    ArrowLeft,
    ArrowUpDown,
    CircleCheck,
    Clapperboard,
    Ellipsis,
    Filter,
    Link,
    PanelRight,
    Plus,
    SendHorizontal,
    Users, Video,
} from "lucide-react";
import {RootState} from "@/store/store";
import {clickedMobileFwdMsgSend} from "@/store/slice/fwdMessageSlice";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import React, {useEffect} from "react";
import {updateUserEmojiStatus} from "@/store/slice/userSlice";
import {app_channel_call, app_channel_path, app_chat_call, app_grp_call} from "@/types/paths";
import {
    MobileTopNavigationBarSecondGroupChat
} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecondGroupChat";
import {MobileTopNavigationBarThirdDoc} from "@/components/navigationBar/mobile/mobileTopNavigationBarThirdDoc";

export function MobileTopNavigationBarThird() {


    const path = usePathname().split('/')
    const dispatch = useDispatch();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const fwdMsgSendClicked = useSelector((state: RootState) => state.fwdMsg.fwdMsgInputInputState.mobileViewSendClicked);

    const router = useRouter();

    const renderComponent = () => {
        switch (path[2]) {
            case "search":
            case "home":
            case "profile":

                return <div className='flex space-x-6 justify-end '>
                    <UserStatusNav userUUID={selfProfile.data?.data.user_uuid || ''}/>
                    <div onClick={()=>{dispatch(openUI({ key: 'userProfileDrawer' }))}}>
                        <UserAvatarNav userUUID={selfProfile.data?.data.user_uuid} userName={selfProfile.data?.data.user_name} userProfileObjKey={selfProfile.data?.data.user_profile_object_key}/>
                    </div>
                </div>;


            case "team":

                if(path.length < 4 && selfProfile.data?.data.user_is_admin)
                    return <div className='flex space-x-1'>
                        <Button className={'!no-underline'} variant='link' onClick={()=>{dispatch(openUI({ key: 'createTeam' }))}} >New</Button>

                    </div>
                if(path.length < 5)
                    return <div className='flex space-x-1'>
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'teamOptionDrawer', data: {teamId: path[3]} }))}}><Ellipsis className='h-5'/></Button>

                    </div>
                break

            case "project":

                if(path.length < 4 && selfProfile.data?.data.user_is_admin)
                    return <div className='flex space-x-1'>
                        <Button className={'!no-underline'} variant='link' onClick={()=>{dispatch(openUI({ key: 'createProject' }))}} >New</Button>

                    </div>
                if(path.length < 5)
                    return <div className='flex space-x-1'>
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'projectTaskFilterDrawer', data: { projectUUID: path[3] } }))}}><Filter className='h-5'/></Button>
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'projectOptionsDrawer', data: { projectUUID: path[3] } }))}}><Ellipsis className='h-5'/></Button>

                    </div>
                break

            case "calendar":
                return <div className='flex space-x-1'>
                    <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'calendarOptionsDrawer' }))}}><Ellipsis className='h-5'/></Button>
                </div>

            case "myTask":

                if(path.length < 4)
                    return <div className='flex space-x-1'>
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'taskFilterDrawer' }))}}><Filter className='h-5'/></Button>
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'myTaskOptionsDrawer' }))}}><Ellipsis className='h-5'/></Button>
                    </div>

                break
            case "task":
                return <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'taskOptionDrawer', data: { taskId: path[3] } }))}}><Ellipsis className='h-5'/></Button>
            break

            case "channel":

                if(path.length < 4)
                    return <Button className={'!no-underline'} variant='link' onClick={()=>{dispatch(openUI({ key: 'createChannel' }))}} >New</Button>
                if(path.length < 5)
                    return <div className='flex space-x-1'>
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'channelOptionsDrawer', data: { channelUUID: path[3] } }))}}><Ellipsis className='h-5'/></Button>
                        </div>
                break
            case "doc":
                if(path.length < 4)
                    return <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'createDoc' }))}}><Plus className='h-5'/></Button>
                if(path.length < 5)
                    return <MobileTopNavigationBarThirdDoc docId={path[3]} />

            case "chat":

                
                if(path.length < 4)
                return  <Button size='icon' variant='ghost' onClick={()=>(dispatch(openUI({ key: 'createChatMessage' })))}><Plus className='h-5'/></Button>

                if(path.length < 5) {

                    return (
                        <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'chatOptionsDrawer', data: {chatUUID: path[3]} }))}}><Ellipsis className='h-5'/></Button>
                    )

                }

                if (path[3] == 'group') {

                    if (path.length < 6)
                        return (
                            <Button variant='ghost' size='icon' onClick={()=>{dispatch(openUI({ key: 'groupChatOptionsDrawer', data: {grpId: path[4]} }))}}><Ellipsis className='h-5'/></Button>

                        )

                }

                break;

            case "forward":

                return  <Button disabled={fwdMsgSendClicked} size='icon' variant='ghost' onClick={()=>(dispatch(clickedMobileFwdMsgSend()))}><SendHorizontal  className='h-5'/></Button>


            default:
                return <></>;
        }
    };

    return (
        <div className='flex justify-end items-center'>
            {renderComponent()}
        </div>
    );
}