import {SearchField} from "@/components/search/searchField";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";

import {
    UserDMInterface,
    UserDMSearchTextInterface,
    UserProfileDataInterface,
    UserProfileInterface
} from "@/types/user";
import {debounceUtil} from "@/lib/utils/helpers/debounce";
import {usePost} from "@/hooks/usePost";
import ChatUserListUser from "@/components/chat/chatUserListUser";
import {app_chat_path, app_grp_chat_path} from "@/types/paths";
import Link from "next/link";
import {RootState} from "@/store/store";
import {useDispatch, useSelector} from "react-redux";
import {CreateUserChatList} from "@/store/slice/chatSlice";
import {sortChatList} from "@/lib/utils/sortChatList";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import * as React from "react";
import {ConditionalWrap} from "@/components/conditionalWrap/conditionalWrap";
import {useMedia} from "@/context/MediaQueryContext";
import {getOtherUserId} from "@/lib/utils/getOtherUserId";
import {LocalizedErrorBoundary} from "@/components/error/LocalizedErrorBoundary";
import {ListSkeleton} from "@/components/ui/ListSkeleton";

export const ChatUserList = ({chatId}: {chatId: string}) => {

    const dispatch = useDispatch();

    const { isMobile } = useMedia()

    const latestChats = useFetch<UserProfileInterface>(GetEndpointUrl.GetUserLatestChatList)
    const [dmSearchText, setDmSearchText] = useState('')

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const post = usePost()

    const [searchDmList, setSearchDmList ] = useState<UserDMInterface[] | null>(null)

    const userChatListState = useSelector((state: RootState) => state.chat.latestChatList || []);
    const chatCallStatus = useSelector((state: RootState) => state.chat.chatCallStatus);

    const selfUserUuid = selfProfile.data?.data.user_uuid;

    useEffect(() => {
        if(latestChats.data?.data.user_dms) {

            dispatch(CreateUserChatList({userDmList: latestChats.data?.data.user_dms}))
        }
    },[latestChats.data?.data, selfUserUuid, dispatch])

    const debouncedSearch = useMemo(() =>
            debounceUtil((dmName: string) => {
                if(dmName.length == 0) return;
                post.makeRequest<UserDMSearchTextInterface, UserProfileDataInterface>({
                    apiEndpoint: PostEndpointUrl.SearchChatWithUser,
                    payload: {
                        search_text: dmName,
                    }
                }).then((resp) => {
                        setSearchDmList(resp?.user_dms || []);

                });
            }, 500),
        [post] // Include post in dependencies
    );

    // Memoize the list to render
    const renderDmList = useMemo(() => {
        return dmSearchText ? searchDmList : userChatListState;
    }, [dmSearchText, searchDmList, userChatListState]);

    // Memoize sorted list instead of using useEffect + useState
    const sortedDmList = useMemo(() => {
        if (!renderDmList || renderDmList.length === 0) return null;
        return sortChatList(renderDmList);
    }, [renderDmList]);

    // Clear search results when search text is cleared
    useEffect(() => {
        if (dmSearchText === '') {
            setSearchDmList(null);
        }
    }, [dmSearchText]);

    const handleDmSearchOnChange = useCallback((dmName: string) => {
        setDmSearchText(dmName);
        if (dmName !== '') {
            debouncedSearch(dmName);
        }
    }, [debouncedSearch]);

    const getDmHref = useCallback((dmId: string, participantCount: number) => {
        if(participantCount > 2) {
            return app_grp_chat_path + '/' + dmId;
        }
        const u = getOtherUserId(dmId, selfProfile.data?.data.user_uuid || '')
        return app_chat_path + '/' + u;
    }, [selfProfile.data?.data.user_uuid]);


    return (
        <div className="flex flex-col h-full overflow-hidden">
            <SearchField onChange={handleDmSearchOnChange} value={dmSearchText} placeholder={"Search users..."}/>

            <div className="flex-1 overflow-y-auto sidebar-extended-channels">
                <LocalizedErrorBoundary fallbackTitle="Chat List Error" fallbackDescription="We couldn't load your recent chats.">
                    {latestChats.isLoading && !sortedDmList && <ListSkeleton rows={10} />}
                    {sortedDmList && sortedDmList.map((dmData, index) => {
                        const filteredUser = dmData.dm_participants.filter((t) => t.user_uuid != selfUserUuid);

                        const lastChat = dmData.dm_chats?.[0];
                        const lastMessageTime = lastChat?.chat_created_at || '';
                        const lastUserMessage = lastChat?.chat_body_text || '';
                        const lastUsername = lastChat?.chat_from?.user_name || '';
                        const attachmentCount = lastChat?.chat_attachments?.length || 0;
                        const isSelected = dmData.dm_participants.length > 2 ? chatId == dmData.dm_grouping_id : chatId == getOtherUserId(dmData.dm_grouping_id, selfProfile.data?.data.user_uuid||'');

                        return (
                            <React.Fragment key={dmData.dm_grouping_id || index}>
                                <ConditionalWrap condition={isMobile} wrap={
                                    (c)=>(
                                        <TouchableDiv rippleBrightness={0.8} rippleDuration={800}>{c}
                                        </TouchableDiv>

                                    )
                                }>
                                {index !== 0 && <hr className="h-px bg-gray-200 border-0 dark:bg-gray-700"/>}
                                <Link href={getDmHref(dmData.dm_grouping_id, dmData.dm_participants.length)} className="block">
                                    <ChatUserListUser
                                        lastMessageTime={lastMessageTime}
                                        lastUserMessage={lastUserMessage}
                                        lastUsername={lastUsername}
                                        unseenMessageCount={dmData.dm_unread || 0}
                                        dmParticipants={filteredUser}
                                        userSelected={isSelected}
                                        attachmentCount={attachmentCount}
                                        selfProfile={selfProfile.data?.data as UserProfileDataInterface}
                                        isCallActive={chatCallStatus[dmData.dm_grouping_id]?.active || false}
                                    />
                                </Link>
                                </ConditionalWrap>
                            </React.Fragment>)

                    })}
                </LocalizedErrorBoundary>
                {dmSearchText && searchDmList && searchDmList.length === 0 && (
                    <div className='text-destructive text-sm p-2 '>DM not available</div>)}
            </div>

        </div>

    )
}