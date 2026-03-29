import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {
    ChannelInfoInterfaceResp,
    ChannelJoinInterface,
    ChannelNotificationInterface,
    NotificationType, UpdateChannelInfoInterface
} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import {ChevronLeft, ChevronRight, Hash, LoaderCircle, Pencil, SendHorizontal, Star, Users, Video, Clapperboard} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import React, {useEffect, useState, useMemo} from "react";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {openUI} from "@/store/slice/uiSlice";
import {ChannelFileUpload} from "@/components/fileUpload/channelFileUpload";
import {
    addUUIDToLocallyCreatedPost, clearChannelInputState,
    createPostLocally, updateChannelInputText, MessageInputState, updateChannelCallStatus
} from "@/store/slice/channelSlice";

import {GenericResponse} from "@/types/genericRes";
import {ChannelMessageList} from "@/components/channel/channelMessageList";
import {UserEmojiStatus} from "@/types/user";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {MobileChannelTextInput} from "@/components/textInput/mobileChannelTextInput";
import {updateUserChannelName} from "@/store/slice/userSlice";
import {app_channel_call, app_grp_call} from "@/types/paths";
import Link from "next/link";
import {ChatLoadingSkeleton} from "@/components/chat/ChatLoadingSkeleton";
import {ChatSkeleton} from "@/components/ui/AppSkeleton";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import CatchMeUpBanner from "@/components/ai/CatchMeUpBanner";


const EMPTY_INPUT_STATE: MessageInputState = { inputTextHTML: '', filesUploaded: [], filePreview: [] }
const EMPTY_TYPING_LIST: any[] = []

export const ChannelIdDesktop = ({channelId, handleSend, unreadCount}: {channelId: string, handleSend: ()=>void, unreadCount?: number}) => {

    const dispatch = useDispatch()
    const postFav  = usePost()
    const postNotification  = usePost()
    const postJoinChannel = usePost()
    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}`:'')
    const [isFavorite, setFavorite] = useState<boolean>(false)
    const [channelNotification, setChannelNotificationType] = useState<string>(NotificationType.NotificationAll)

    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelNme = useMemo(() => userChannels?.find((item)=>item.ch_uuid == channelId), [userChannels, channelId]);

    const channelState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || EMPTY_INPUT_STATE);

    const rawChannelTyping = useSelector((state: RootState) => state.typing.channelTyping[channelId] || EMPTY_TYPING_LIST);
    const channelTypingState = useMemo(() => rawChannelTyping.map(item => item.user), [rawChannelTyping]);

    const channelCallActive = useSelector((state: RootState) => state.channel.channelCallStatus[channelId]?.active || false)

    const { publishTyping } = usePublishTyping({ targetType: 'channel', targetId: channelId });

    useEffect(() => {

        if(channelInfo.data?.channel_info.ch_is_user_fav) {
            setFavorite(true)
        }

        if(channelInfo.data?.channel_info.notification_type) {
            setChannelNotificationType(channelInfo.data?.channel_info.notification_type)
        }


    }, [channelInfo.data?.channel_info])

    if(!channelId) return

    if(!channelInfo.data?.channel_info && channelInfo.isLoading) return <ChatSkeleton />

    const toggleFavourite = async () => {
            if(isFavorite) {
               await postFav.makeRequest({apiEndpoint: PostEndpointUrl.RemoveFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{
                       setFavorite(false)}})
            } else {
                await postFav.makeRequest({apiEndpoint: PostEndpointUrl.AddFavChannel, appendToUrl:`/${channelId}`, onSuccess : ()=>{setFavorite(true)}})
            }
    }

    const joinChannel = async () => {
        await postJoinChannel.makeRequest<ChannelJoinInterface>({apiEndpoint: PostEndpointUrl.JoinChannel, payload: {channel_uuid: channelId}, onSuccess : ()=>{
            channelInfo.mutate()
            }})
    }


    const UpdateNotification = async () => {
        const nextNotification = getNextNotification(channelNotification)
        await postNotification.makeRequest<ChannelNotificationInterface, GenericResponse >({payload:{channel_id: channelId, notification_type: nextNotification}, apiEndpoint: PostEndpointUrl.UpdateChannelNotification})
        setChannelNotificationType(nextNotification)
    }


    const channelCallHref = `${app_channel_call}/${channelId}`;
    const channelRecordingHref = `/app/channel/${channelId}/recording`;



    const renderChatInput = () =>{

        if(!channelInfo.data?.channel_info.ch_is_member) {
            return (
                <div className='h-20 flex-col justify-center items-center w-full text-center space-y-2'>
                    <div>you are not the member of the channel</div>
                    <Button onClick={joinChannel}>
                        Join channel
                    </Button>
                </div>
            )
        }

        if (!isZeroEpoch(channelInfo.data?.channel_info.ch_deleted_at || '')) {
            return (
                <div className=' flex-col justify-center items-center w-full text-center space-y-2 text-muted-foreground'>
                    <div>Channel is archived 📦</div>
                    {/*{channelInfo.data?.channel_info.ch_is_admin &&*/}
                    {/*    <Button onClick={joinChannel}>*/}
                    {/*        Unarchive channel*/}
                    {/*    </Button>}*/}
                </div>
            )
        }

        return (<MinimalTiptapTextInput
            throttleDelay={300}
            attachmentOnclick = {()=>{dispatch(openUI({ key: 'channelFileUpload' }))}}
            className={cn("max-w-full rounded-xl h-auto border-none")}
            editorContentClassName="overflow-auto mb-2"
            output="html"
            content={channelState.inputTextHTML}
            placeholder={"message"}
            editable={true}
            ButtonIcon={SendHorizontal}
            buttonOnclick={handleSend}
            editorClassName="focus:outline-none px-2 py-2"
            onChange={(content ) => {
                publishTyping()
                dispatch(updateChannelInputText({channelId, inputTextHTML: content as string}))
            }}
        >
            <ChannelFileUpload channelId={channelId}/>
        </MinimalTiptapTextInput>)
    }


    return (
        <div className='flex flex-col h-full w-full min-w-0'>
            <div
                className='flex font-semibold text-lg p-2 truncate overflow-x-hidden overflow-ellipsis justify-start border-b'>
                <div className='flex justify-center items-center space-x-1'>
                    <div><Hash className='h-5 w-5 text-muted-foreground'/></div>
                    <div>{channelNme?.ch_name}</div>
                </div>
                <div className='flex justify-center items-center ml-2'>
                    <Button size='icon' variant='ghost' onClick={toggleFavourite}><Star  className='text-muted-foreground' fill={isFavorite ?"#ffcc00":'none'}/></Button>

                    <NotificationBell notificationType={channelNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    <Button size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editChannel', data: { channelUUID: channelId } }))}}><Pencil /></Button>
                    <Button size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editChannelMember', data: { channelUUID: channelId } }))}}> <Users /></Button>
                    <Link href={channelCallHref}>
                    <Button
                        size='icon'
                        variant={channelCallActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition-all duration-300",
                            channelCallActive && "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40"
                        )}
                    >
                        <Video size={18} />
                        {channelCallActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                        )}
                    </Button>
                    </Link>
                    <Link href={channelRecordingHref}><Button size='icon' variant='ghost'> <Clapperboard /></Button></Link>



                </div>


            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                <CatchMeUpBanner
                    channelUUID={channelId}
                    unreadCount={unreadCount || 0}
                    channelName={channelNme?.ch_name}
                />
                <ChannelMessageList channelId={channelId} isAdmin={channelInfo.data?.channel_info.ch_is_admin}/>
            </div>
            <div className="sticky bottom-0 left-0 right-0 z-50 border-t focus:border p-4 ">
                <div>
                    {renderChatInput()}
                </div>
            </div>

        </div>
    )
}