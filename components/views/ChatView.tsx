"use client";


import { useMedia } from "@/context/MediaQueryContext";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { usePost } from "@/hooks/usePost";
import { useScheduleMessage } from "@/hooks/useScheduledMessages";
import { ScheduleSendContext } from "@/context/ScheduleSendContext";
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
  restoreUnsentChatMessage,
  createChat, updateChatCallStatus,
  updateChatScrollToBottom,
  UpdateMessageInChatList,
  UpdateUnreadCountToZero,
} from "@/store/slice/chatSlice";
import { useEffect, useRef } from "react";
import { addUserToUserChatList, resetUserChatUnread } from "@/store/slice/userSlice";
import { clearChatUnread } from "@/services/unreadCache";
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags";
import { getGroupingId } from "@/lib/utils/getGroupingId";
import { NotificationType } from "@/types/channel";
import { EmptyState } from "@/components/ui/empty-state";
import { Lock } from "@/lib/icons";
import { isExternalUser } from "@/lib/utils/isExternalUser";
import { useToast } from "@/hooks/use-toast";
import { NOT_SENT_TOAST, type Draft } from "@/lib/chat/unsentMessage";

export function ChatView({ chatId }: { chatId: string }) {

  const post = usePost();
  const scheduleMessage = useScheduleMessage();
  const dispatch = useDispatch();
  const { toast } = useToast();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
    GetEndpointUrl.SelfProfile
  );

  const userChats = useSelector((state: RootState) => state.users.userSidebar.userChats);
  const grpId = selfProfile.data?.data.user_uuid ? getGroupingId(chatId, selfProfile.data.data.user_uuid) : '';
  const chatInSidebar = userChats.find(chat => chat.dm_grouping_id === grpId);
  const unreadCountRef = useRef(chatInSidebar?.dm_unread || 0);

  const EMPTY_CHATS: ChatInfo[] = [];
  const EMPTY_INPUT_STATE = {};

  const chatMessageState = useSelector(
    (state: RootState) => state.chat.chatMessages[chatId] || EMPTY_CHATS
  );

  const { isMobile, isDesktop } = useMedia();

  const chatState = useSelector(
    (state: RootState) => state.chat.chatInputState[chatId] || EMPTY_INPUT_STATE
  );

  const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(
    chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : ''
  );

  const latestMsg = useFetch<CreateChatMessagePaginationResRaw>(
    chatId ? GetEndpointUrl.GetChatLatestMessage + "/" + chatId : ''
  );

  useEffect(() => {
    if (otherUserInfo.data?.data && selfProfile.data?.data) {
      // Don't add external users to the user's DM sidebar — they aren't
      // messageable contacts. We still want to render the inert empty
      // state below, but no sidebar pollution.
      if (isExternalUser(otherUserInfo.data.data)) return;

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
      // Use the proper grouping ID (space-separated UUID pair) to match dm_grouping_id
      const dmGroupingId = getGroupingId(selfProfile.data?.data.user_uuid || '', chatId);
      dispatch(updateChatCallStatus({grpId: dmGroupingId, callStatus: otherUserInfo.data.data.user_call_active || false}))
    }
  }, [otherUserInfo.data?.data]);

  // Send later: the same body Send would post, handed to the scheduler.
  const handleSchedule = async (latestContent: string | undefined, at: Date) => {
    const body = removeEmptyPTags(latestContent ?? chatState.chatBody);
    if (body.length == 0 && !chatState.filesUploaded?.length) return false;
    if (isExternalUser(otherUserInfo.data?.data)) return false;
    const replyToUuid = chatState.replyToUuid;
    const ok = await scheduleMessage("dm", {
      media_attachments: chatState.filesUploaded,
      to_uuid: chatId,
      text_html: body,
      ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
    }, at);
    if (ok) dispatch(clearChatInputState({ chatUUID: chatId }));
    return ok;
  };

  const handleSend = (latestContent?: string) => {
    // Prefer the editor's latest HTML (passed in by the input wrapper after
    // it flushed the pending throttle window) over the Redux snapshot —
    // the snapshot lags by 1 keystroke when the user clicks Send before
    // the throttle's trailing-edge has fired, which would otherwise drop
    // the most recently typed character.
    const rawBody = latestContent ?? chatState.chatBody;
    const body = removeEmptyPTags(rawBody);

    if (body.length == 0) return;

    // Defence-in-depth: never POST a DM to an external recipient even if
    // the UI somehow reaches this code path. The server also enforces
    // this; we just save a round-trip and a confusing toast.
    if (isExternalUser(otherUserInfo.data?.data)) return;

    // Kept until the server has it. The composer empties now, so the next
    // message can be typed, and this goes back into it if the send fails.
    const unsent: Draft = {
      html: body,
      files: chatState.filesUploaded ?? [],
      previews: chatState.filesPreview ?? [],
      replyToUuid: chatState.replyToUuid,
      replyToAuthorName: chatState.replyToAuthorName,
      replyToText: chatState.replyToText,
    };

    // Discord-style inline reply: carry the armed reply target (if any) so the
    // backend sets the reply edge, and build an optimistic parent preview.
    const replyToUuid = chatState.replyToUuid;
    const optimisticReplyTo: ChatInfo | undefined = replyToUuid
      ? {
          chat_uuid: replyToUuid,
          chat_body_text: chatState.replyToText || "",
          chat_from: { user_name: chatState.replyToAuthorName || "" } as UserProfileDataInterface,
          chat_to: {} as UserProfileDataInterface,
          chat_created_at: "",
          chat_attachments: [],
          chat_comment_count: 0,
        }
      : undefined;

    post
      .makeRequest<CreateOrUpdateChatsReq, CreateChatRes>({
        apiEndpoint: PostEndpointUrl.CreateChatMessage,
        payload: {
          media_attachments: chatState.filesUploaded,
          to_uuid: chatId,
          text_html: body,
          ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
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
              replyTo: optimisticReplyTo,
              addedLocally: true,
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
      }, () => {
        dispatch(restoreUnsentChatMessage({ chatUUID: chatId, unsent }));
        toast(NOT_SENT_TOAST);
      });
    dispatch(clearChatInputState({ chatUUID: chatId }));
  };

  useEffect(() => {
    if(!chatId || !selfProfile.data?.data.user_uuid) return;
    const grplclId = getGroupingId(chatId, selfProfile.data?.data.user_uuid);
    dispatch(
      UpdateUnreadCountToZero({
        grpId: grplclId,
      })
    );
    dispatch(resetUserChatUnread({ dm_grouping_id: grplclId }));
    // The server marker is advanced by the chat fetch itself, but the SWR caches
    // that hydrate these badges are not, and on a remount they re-seed Redux from
    // a payload recorded before the read. See services/unreadCache.ts.
    clearChatUnread(grplclId);
  }, [chatId, selfProfile.data?.data.user_uuid]);

  if(!chatId) return

  // Block DMs to external users client-side. The BE also rejects this on
  // CreateChatMessage as defence-in-depth, but rendering an inert chat
  // surface for an external recipient lets users land here from a stale
  // link/back button without sending requests that will only fail.
  if (isExternalUser(otherUserInfo.data?.data)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Lock}
          title="Direct messages aren't available"
          description="This contact is external to your workspace. Mention them in a task or comment to collaborate instead."
        />
      </div>
    );
  }

  return (
    <>
      <ScheduleSendContext.Provider value={{ kind: "dm", target: chatId, schedule: handleSchedule }}>
      {isMobile && <ChatIdMobile chatId={chatId} handleSend={handleSend} unreadCount={unreadCountRef.current} />}

      {isDesktop && <ChatIdDesktop chatId={chatId} handleSend={handleSend} unreadCount={unreadCountRef.current} />}
      </ScheduleSendContext.Provider>
    </>
  );
}
