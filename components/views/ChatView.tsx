"use client";


import { displayNameOf } from "@/lib/personName"
import { useMedia } from "@/context/MediaQueryContext";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user";
import { useScheduleMessage } from "@/hooks/useScheduledMessages";
import { ScheduleSendContext } from "@/context/ScheduleSendContext";
import { useDispatch, useStore } from "react-redux";
import { RootState } from "@/store/store";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { ChatIdMobile } from "@/components/chat/chatIdMobile";
import { ChatIdDesktop } from "@/components/chat/chatIdDesktop";
import {
  ChatInfo,
  CreateChatRes,
  CreateOrUpdateChatsReq,
} from "@/types/chat";
import {
  AddUserInChatList,
  addPendingChat,
  clearChatInputState,
  confirmPendingChat,
  failPendingChat,
  removePendingChat,
  restoreUnsentChatMessage,
  retryPendingChat,
  updateChatCallStatus,
  updateChatScrollToBottom,
  UpdateMessageInChatList,
  UpdateUnreadCountToZero,
} from "@/store/slice/chatSlice";
import { useEffect, useMemo, useState } from "react";
import { addUserToUserChatList, resetUserChatUnread } from "@/store/slice/userSlice";
import { clearChatUnread } from "@/services/unreadCache";
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags";
import { getGroupingId } from "@/lib/utils/getGroupingId";
import { NotificationType } from "@/types/channel";
import { EmptyState } from "@/components/ui/empty-state";
import { Lock } from "@/lib/icons";
import { isExternalUser } from "@/lib/utils/isExternalUser";
import { useStableCallback } from "@/hooks/useStableCallback";
import { newLocalId } from "@/lib/chat/pendingSend";
import { appMutate } from "@/lib/swrMutate";
import { PendingSendContext } from "@/components/message/sendStatus";
import { SEND_QUIETLY, usePendingSend, viewingLinkedMessage } from "@/components/views/usePendingSend";
import axiosInstance from "@/lib/axiosInstance";
import { useToast } from "@/hooks/use-toast";
import { NOT_SENT_TOAST, type Draft } from "@/lib/chat/unsentMessage";

const EMPTY_INPUT_STATE: Partial<RootState["chat"]["chatInputState"][string]> = {};

export function ChatView({ chatId }: { chatId: string }) {

  const scheduleMessage = useScheduleMessage();
  const { toast } = useToast();
  const dispatch = useDispatch();
  const store = useStore<RootState>();

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(
    GetEndpointUrl.SelfProfile
  );

  // How many were unread on opening, read once (see ChannelView).
  const [unreadOnOpen] = useState(() => {
    const self = store.getState().users.userSidebar.userChats
    const me = selfProfile.data?.data.user_uuid
    if (!me) return 0
    const grpId = getGroupingId(chatId, me)
    return self.find((chat) => chat.dm_grouping_id === grpId)?.dm_unread || 0
  });

  const { isMobile, isDesktop } = useMedia();

  const otherUserInfo = useFetchOnlyOnce<UserProfileInterface>(
    chatId ? `${GetEndpointUrl.SelfProfile}/${chatId}` : ''
  );

  const latestKey = chatId ? GetEndpointUrl.GetChatLatestMessage + "/" + chatId : '';

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

  // A message is in the conversation the moment Send is pressed (lib/chat/pendingSend).
  const { send, actions } = usePendingSend<ChatInfo, CreateOrUpdateChatsReq, CreateChatRes>({
    endpoint: PostEndpointUrl.CreateChatMessage,
    add: (chat) => addPendingChat({ dmId: chatId, chat }),
    confirm: (localId, res) => confirmPendingChat({ dmId: chatId, localId, chatUUID: res?.uuid || '', createdAt: res?.chat_created_at }),
    fail: (localId) => failPendingChat({ dmId: chatId, localId }),
    retry: (localId) => retryPendingChat({ dmId: chatId, localId }),
    remove: (localId) => removePendingChat({ dmId: chatId, localId }),
    find: (state, localId) => state.chat.chatMessages[chatId]?.find((c) => c.chat_local_id === localId),
    payloadOf: (chat) => ({
      media_attachments: chat.chat_attachments,
      to_uuid: chatId,
      text_html: chat.chat_body_text,
      ...(chat.chat_reply_to?.chat_uuid ? { reply_to_uuid: chat.chat_reply_to.chat_uuid } : {}),
    }),
    draftOf: (chat) => ({
      html: chat.chat_body_text,
      files: chat.chat_attachments || [],
      previews: [],
      replyToUuid: chat.chat_reply_to?.chat_uuid,
      replyToAuthorName: chat.chat_reply_to?.chat_from?.user_name,
      replyToText: chat.chat_reply_to?.chat_body_text,
    }),
    restore: (unsent) => restoreUnsentChatMessage({ chatUUID: chatId, unsent }),
    onSent: (chat, res) => {
      // The DM list's preview names the message once the server has it.
      const me = selfProfile.data?.data
      dispatch(
        UpdateMessageInChatList({
          name: displayNameOf(me) || "",
          msgTime: res?.chat_created_at || chat.chat_created_at,
          attachments: chat.chat_attachments,
          msg: chat.chat_body_text,
          chatUuid: res?.uuid || '',
          grpId: getGroupingId(chatId, me?.user_uuid || ""),
        })
      );
      void appMutate(latestKey);
    },
  });

  // Send later: the same body Send would post, handed to the scheduler.
  const handleSchedule = useStableCallback(async (latestContent: string | undefined, at: Date) => {
    const chatState = store.getState().chat.chatInputState[chatId] || EMPTY_INPUT_STATE;
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
  });

  const handleSend = useStableCallback((latestContent?: string) => {
    // The draft as it is now, read when sending rather than subscribed to.
    const chatState = store.getState().chat.chatInputState[chatId] || EMPTY_INPUT_STATE;
    // Prefer the editor's latest HTML (flushed past the throttle window) over
    // the store's copy, which can lag one keystroke behind.
    const body = removeEmptyPTags(latestContent ?? chatState.chatBody);
    const files = chatState.filesUploaded || [];

    // Words, or files on their own: a message of only a photo is a message.
    if (body.length == 0 && files.length == 0) return;

    // Defence-in-depth: never POST a DM to an external recipient even if
    // the UI somehow reaches this code path. The server also enforces
    // this; we just save a round-trip and a confusing toast.
    if (isExternalUser(otherUserInfo.data?.data)) return;

    const replyToUuid = chatState.replyToUuid;
    const replyTo: ChatInfo | undefined = replyToUuid
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

    dispatch(clearChatInputState({ chatUUID: chatId }));

    // Parked on an older message from a link, the latest are not loaded, so
    // there is nowhere to show it yet: it is sent as it was, and goes back in
    // the message box if it does not go.
    if (viewingLinkedMessage("messageId")) {
      const unsent: Draft = { html: body, files, previews: chatState.filesPreview ?? [], replyToUuid, replyToAuthorName: chatState.replyToAuthorName, replyToText: chatState.replyToText };
      axiosInstance.post(PostEndpointUrl.CreateChatMessage, {
        media_attachments: files,
        to_uuid: chatId,
        text_html: body,
        ...(replyToUuid ? { reply_to_uuid: replyToUuid } : {}),
      }, SEND_QUIETLY).then(() => void appMutate(latestKey), () => {
        dispatch(restoreUnsentChatMessage({ chatUUID: chatId, unsent }));
        toast(NOT_SENT_TOAST);
      });
      return;
    }

    const localId = newLocalId();
    send(localId, {
      chat_uuid: localId,
      chat_local_id: localId,
      chat_send_state: "sending",
      chat_added_locally: true,
      chat_from: selfProfile.data?.data || ({} as UserProfileDataInterface),
      chat_to: otherUserInfo.data?.data || ({} as UserProfileDataInterface),
      chat_created_at: new Date().toISOString(),
      chat_body_text: body,
      chat_attachments: files,
      chat_reply_to: replyTo,
      chat_comment_count: 0,
    });
    dispatch(updateChatScrollToBottom({ chatId: chatId, scrollToBottom: true }));
  });

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

  const schedule = useMemo(() => ({ kind: "dm" as const, target: chatId, schedule: handleSchedule }), [chatId, handleSchedule]);

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
    <PendingSendContext.Provider value={actions}>
      <ScheduleSendContext.Provider value={schedule}>
      {isMobile && <ChatIdMobile chatId={chatId} handleSend={handleSend} unreadCount={unreadOnOpen} />}

      {isDesktop && <ChatIdDesktop chatId={chatId} handleSend={handleSend} unreadCount={unreadOnOpen} />}
      </ScheduleSendContext.Provider>
    </PendingSendContext.Provider>
  );
}
