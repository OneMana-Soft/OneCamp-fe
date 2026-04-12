"use client";


import { useMedia } from "@/context/MediaQueryContext";
import { useParams } from "next/navigation";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { usePost } from "@/hooks/usePost";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { ChatIdMobile } from "@/components/chat/chatIdMobile";
import { ChatIdDesktop } from "@/components/chat/chatIdDesktop";
import {
  ChatInfo,
  CreateChatMessagePaginationResRaw,
  CreateChatRes,
  CreateOrUpdateChatsReq,
} from "@/types/chat";
import {
  AddUserInChatList,
  clearChatInputState,
  createChat, updateChatCallStatus,
  updateChatScrollToBottom,
  UpdateMessageInChatList,
  UpdateUnreadCountToZero,
} from "@/store/slice/chatSlice";
import { useEffect } from "react";
import { addUserToUserChatList, resetUserChatUnread } from "@/store/slice/userSlice";
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags";
import { getGroupingId } from "@/lib/utils/getGroupingId";
import { NotificationType } from "@/types/channel";

export default function Page() {
  const params = useParams();
  const chatId = params?.["chat-id"] as string;

  const post = usePost();

  const EMPTY_CHATS: ChatInfo[] = [];
  const EMPTY_INPUT_STATE = {};

  const chatMessageState = useSelector(
    (state: RootState) => state.chat.chatMessages[chatId] || EMPTY_CHATS
  );

  const { isMobile, isDesktop } = useMedia();

  const chatState = useSelector(
    (state: RootState) => state.chat.chatInputState[chatId] || EMPTY_INPUT_STATE
  );

  const dispatch = useDispatch();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
    GetEndpointUrl.SelfProfile
  );

  const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(
    chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : ''
  );

  const latestMsg = useFetch<CreateChatMessagePaginationResRaw>(
    chatId ? GetEndpointUrl.GetChatLatestMessage + "/" + chatId : ''
  );

  useEffect(() => {
    if (otherUserInfo.data?.data && selfProfile.data?.data) {
      const d = {
        dm_unread: 0,
        dm_grouping_id: getGroupingId(
          otherUserInfo.data.data.user_uuid,
          selfProfile.data?.data.user_uuid
        ),
        dm_participants: [otherUserInfo.data.data],
        dm_notification_type:
          otherUserInfo.data.data.notification_type ||
          NotificationType.NotificationAll,
      };

      dispatch(addUserToUserChatList({ chatUserDm: d }));
      dispatch(AddUserInChatList({ usersDm: d }));
      dispatch(updateChatCallStatus({grpId: chatId, callStatus: otherUserInfo.data.data.user_call_active || false}))
    }
  }, [otherUserInfo.data?.data]);

  const handleSend = () => {
    const body = removeEmptyPTags(chatState.chatBody);

    if (body.length == 0) return;

    post
      .makeRequest<CreateOrUpdateChatsReq, CreateChatRes>({
        apiEndpoint: PostEndpointUrl.CreateChatMessage,
        payload: {
          media_attachments: chatState.filesUploaded,
          to_uuid: chatId,
          text_html: body,
        },
      })
      .then((res) => {
        if (
          res &&
          latestMsg.data?.data &&
          latestMsg.data?.data?.chats?.[0]?.chat_uuid ==
            chatMessageState[chatMessageState.length - 1]?.chat_uuid
        ) {
          dispatch(
            createChat({
              dmId: chatId,
              chatCreatedAt: res?.chat_created_at,
              chatBy:
                selfProfile.data?.data || ({} as UserProfileDataInterface),
              chatText: body,
              attachments: chatState.filesUploaded,
              chatId: res?.uuid,
              chatTo:
                otherUserInfo.data?.data || ({} as UserProfileDataInterface),
            })
          );

          dispatch(
            UpdateMessageInChatList({
              name: selfProfile.data?.data.user_name || "",
              msgTime: res?.chat_created_at,
              attachments: chatState.filesUploaded,
              msg: body,
              chatUuid: res?.uuid || '',
              grpId: getGroupingId(
                chatId,
                selfProfile.data?.data.user_uuid || ""
              ),
            })
          );

          latestMsg.mutate();
          dispatch(
            updateChatScrollToBottom({ chatId: chatId, scrollToBottom: true })
          );
        }
      });
    dispatch(clearChatInputState({ chatUUID: chatId }));
  };

  useEffect(() => {
    if(!chatId || !selfProfile.data?.data.user_uuid) return;
    const grpId = getGroupingId(chatId, selfProfile.data?.data.user_uuid);
    dispatch(
      UpdateUnreadCountToZero({
        grpId,
      })
    );
    dispatch(resetUserChatUnread({ dm_grouping_id: grpId }));
  }, [chatId, selfProfile.data?.data.user_uuid]);

  if(!chatId) return

  return (
    <>
      {isMobile && <ChatIdMobile chatId={chatId} handleSend={handleSend} />}

      {isDesktop && <ChatIdDesktop chatId={chatId} handleSend={handleSend} />}
    </>
  );
}
