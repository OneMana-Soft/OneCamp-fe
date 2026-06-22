import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {
    ChannelInfoInterfaceResp,
    ChannelJoinInterface,
    ChannelNotificationInterface,
    NotificationType, UpdateChannelInfoInterface
} from "@/types/channel";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import CommandSurface from "@/components/command/CommandSurface";
import {cn} from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";
import { ChevronLeft, ChevronRight, Hash, LoaderCircle, Pencil, SendHorizontal, Star, Users, Video, Clapperboard, Lightbulb, Megaphone } from "@/lib/icons";
import {Button} from "@/components/ui/button";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {NotificationBell} from "@/components/Notification/notificationBell";
import {usePost} from "@/hooks/usePost";
import React, {useEffect, useState, useMemo} from "react";
import {getNextNotification} from "@/lib/utils/getNextNotification";
import {openUI} from "@/store/slice/uiSlice";
import { toggleUserChannelFavorite } from "@/store/slice/userSlice";
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
import {useUploadFile} from "@/hooks/useUploadFile";

const EMPTY_INPUT_STATE: MessageInputState = { inputTextHTML: '', filesUploaded: [], filePreview: [] }
const EMPTY_TYPING_LIST: any[] = []

export const ChannelIdDesktop = ({channelId, handleSend, unreadCount}: {channelId: string, handleSend: (latestContent?: string)=>void, unreadCount?: number}) => {

    const dispatch = useDispatch()
    const postFav  = usePost()
    const postNotification  = usePost()
    const postJoinChannel = usePost()
    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}`:'')
    const [isFavorite, setFavorite] = useState<boolean>(false)
    const [channelNotification, setChannelNotificationType] = useState<string>(NotificationType.NotificationAll)
    const uploadFile = useUploadFile()

    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelNme = useMemo(() => userChannels?.find((item)=>item.ch_uuid == channelId), [userChannels, channelId]);
    // Fallback to API response when channel isn't in sidebar state yet
    // (e.g. direct navigation from notification/bookmark)
    const channelDisplayName = channelNme?.ch_name || channelInfo.data?.channel_info?.ch_name || "channel";

    const channelState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || EMPTY_INPUT_STATE);

    const rawChannelTyping = useSelector((state: RootState) => state.typing.channelTyping[channelId] || EMPTY_TYPING_LIST);
    const channelTypingState = useMemo(() => rawChannelTyping.map(item => item.user), [rawChannelTyping]);

    const channelCallActive = useSelector((state: RootState) => state.channel.channelCallStatus[channelId]?.active || false)

    const { publishTyping } = usePublishTyping({ targetType: 'channel', targetId: channelId });

    useEffect(() => {

        if (channelInfo.data?.channel_info) {
            setFavorite(!!channelInfo.data.channel_info.ch_is_user_fav)
        }

        if(channelInfo.data?.channel_info.notification_type) {
            setChannelNotificationType(channelInfo.data?.channel_info.notification_type)
        }


    }, [channelInfo.data?.channel_info])

    if(!channelId) return

    if(!channelInfo.data?.channel_info && channelInfo.isLoading) return <ChatSkeleton />

    const toggleFavourite = async () => {
        const nextState = !isFavorite;
        // Optimistic update
        setFavorite(nextState);
        dispatch(toggleUserChannelFavorite({ channelUUID: channelId, isFavorite: nextState }));

        try {
            if (isFavorite) {
                await postFav.makeRequest({
                    apiEndpoint: PostEndpointUrl.RemoveFavChannel,
                    appendToUrl: `/${channelId}`,
                });
            } else {
                await postFav.makeRequest({
                    apiEndpoint: PostEndpointUrl.AddFavChannel,
                    appendToUrl: `/${channelId}`,
                });
            }
        } catch {
            // Revert on failure
            setFavorite(!nextState);
            dispatch(toggleUserChannelFavorite({ channelUUID: channelId, isFavorite: !nextState }));
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

        // Announcement channel: only moderators can post. Everyone else sees a
        // read-only notice instead of a composer that would 403 on send.
        if (
            channelInfo.data?.channel_info.ch_post_policy === "admins_only" &&
            !channelInfo.data?.channel_info.ch_is_admin
        ) {
            return (
                <div className="flex items-center justify-center gap-2 w-full py-4 text-center text-sm text-muted-foreground">
                    <Megaphone className="h-4 w-4" />
                    <span>Only moderators can post in this announcement channel.</span>
                </div>
            )
        }

        return (<>
        <CommandSurface
            surfaceKey={channelId}
            channelId={channelId}
            onComposerText={(text) =>
                dispatch(updateChannelInputText({ channelId, inputTextHTML: `<p>${text}</p>` }))
            }
            onComposerHtml={(html) =>
                dispatch(updateChannelInputText({ channelId, inputTextHTML: html }))
            }
        />
        <MinimalTiptapTextInput
            throttleDelay={300}
            attachmentOnclick = {()=>{dispatch(openUI({ key: 'channelFileUpload' }))}}
            onActionFiles={async (files) => {
                if (!files?.length) return;
                const valid = uploadFile.validateFiles(files);
                if (valid.length === 0) return;
                await uploadFile.makeRequestToUploadToChannel(valid as unknown as FileList, channelId);
            }}
            className={cn("max-w-full h-auto")}
            editorContentClassName="overflow-auto mb-2"
            output="html"
            content={channelState.inputTextHTML}
            placeholder={"Message #" + channelDisplayName}
            editable={true}
            ButtonIcon={SendHorizontal}
            buttonOnclick={handleSend}
            editorClassName="focus:outline-none px-2 py-2"
            onChange={(content ) => {
                publishTyping(content as string)
                dispatch(updateChannelInputText({channelId, inputTextHTML: content as string}))
            }}

        >
            <ChannelFileUpload channelId={channelId}/>
        </MinimalTiptapTextInput>
        </>)
    }


    return (
        <div className='flex flex-col h-full w-full min-w-0'>
            <div
                className='flex font-semibold text-lg p-2 truncate overflow-x-hidden overflow-ellipsis justify-start border-b'>
                <div className='flex justify-center items-center space-x-1'>
                    <div><Hash className='h-5 w-5 text-muted-foreground'/></div>
                    <div>{channelDisplayName}</div>
                </div>
                <div className='flex justify-center items-center ml-2'>
                    <Button size='icon' variant='ghost' onClick={toggleFavourite} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}>
                        <Star className={isFavorite ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}/>
                    </Button>

                    <NotificationBell notificationType={channelNotification} isLoading={postNotification.isSubmitting} onNotCLick={UpdateNotification}/>
                    {channelInfo.data?.channel_info.ch_is_admin && (
                        <Button size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editChannel', data: { channelUUID: channelId } }))}}><Pencil /></Button>
                    )}
                    <Button size='icon' variant='ghost' onClick={()=>{dispatch(openUI({ key: 'editChannelMember', data: { channelUUID: channelId } }))}}> <Users /></Button>
                    <Link href={channelCallHref}>
                    <Button
                        size='icon'
                        variant={channelCallActive ? 'secondary' : 'ghost'}
                        className={cn(
                            "relative transition-all duration-300",
                            channelCallActive && "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                        )}
                    >
                        <Video size={18} />
                        {channelCallActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColors.online.solid}`}></span>
                            </span>
                        )}
                    </Button>
                    </Link>
                    <Link href={channelRecordingHref}><Button size='icon' variant='ghost'> <Clapperboard /></Button></Link>
                    <Link
                        href={`/app/ai/memory?channel=${encodeURIComponent(channelId)}&name=${encodeURIComponent(channelDisplayName)}`}
                        title="Channel memory — decisions, commitments & open questions"
                    >
                        <Button size='icon' variant='ghost' aria-label="Channel memory">
                            <Lightbulb className="text-muted-foreground" />
                        </Button>
                    </Link>



                </div>


            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
                <ChannelMessageList channelId={channelId} isAdmin={channelInfo.data?.channel_info.ch_is_admin}/>
            </div>
            <div className="sticky bottom-0 left-0 right-0 z-[var(--z-fixed)] pb-4 px-4 bg-background/95 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto w-full">
                    {renderChatInput()}
                </div>
            </div>

        </div>
    )
}