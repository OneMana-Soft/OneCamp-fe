/**
 * The chat area's API endpoints: what only chat code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum ChatGet {
    UserListNotBelongToDm = "user/usersListWhoDontBelongToTheDM",
    CheckChannelNameAvailability = "/ch/chNameIsAvailable",
    ChannelRecordingList = "/ch/getRecordingList",
    ChatRecordingList = "/dm/getRecordingList",
    GroupChatRecordingList = "/groupChat/getRecordingList",
    GetNewPostIncludingCurrentPost = "/po/newPostsIncludingCurrent",
    GetNewChatIncludingCurrentChat = "/dm/newChatsIncludingCurrentChat",
    GetNewGroupChatIncludingCurrentChat = "/groupChat/newChatsIncludingCurrentChat",
    GetNewPostAfter = "/po/newPosts",
    GetNewChatAfter = "/dm/newChats",
    GetNewGroupChatAfter = "/groupChat/newChats",
    GetOldPostBefore = "/po/oldPosts",
    GetOldChatBefore = "/dm/oldChats",
    GetOldGroupChatBefore = "/groupChat/oldChats",
    GetOnlyPostText = "/po/getOnlyPostText",
    GetOnlyChatText = "/dm/getChatOnlyText",
    GetOnlyGroupChatText = "/groupChat/getChatOnlyText",
    GetPostWithAllComments = "/po/allComments",
    GetChatWithAllComments = "/dm/chatWithAllComments",
    GetDMAISuggestions = "/user/dm-ai-suggestions",
    // The public channels to join (?pageIndex=&pageSize=&search=): paged and
    // searched on the server, without the ones you're in.
    GetDiscoverChannelList = "/ch/discover",
    /** A task's older history lines: ?before={activity_uuid}&first=N, oldest to newest (PROJ-BUG-8). */
    GetTaskActivityList = "/task/getTaskActivityList",
    GetUserPosts = "/user/posts",
    GetTeammateNotificationStatus = "/user/notificationStatus",
    // Slash command framework (user-facing)
    GetCommandCatalog = "/command/catalog",
}

export enum ChatPost {
    ScheduleMessage = "/message/schedule",
    UpdateScheduledMessage = "/message/scheduled/update",
    CancelScheduledMessage = "/message/scheduled/cancel",
    SendScheduledMessageNow = "/message/scheduled/sendNow",
    MarkChannelSeen = "/ch/markSeen", // append /{channel_uuid}
    // Bring an archived channel back ({channel_uuid}): its admins and
    // workspace admins.
    RestoreChannel = "/ch/restore",
    DeleteChannelRecording = "/ch/deleteRecording", // append /{egressId}
    DeleteChatRecording = "/dm/deleteRecording", // append /{egressId}
    DeleteGroupChatRecording = "/groupChat/deleteRecording", // append /{egressId}
    PublishChannelTyping = "/ch/publishChannelTyping",
    PublishChatTyping = "/dm/publishChatTyping",
    // Slash command framework (user-facing)
    ExecuteCommand = "/command/execute",
    InteractCommand = "/command/interact",
}

// Docs programme: a package's base path, one line per package at its merge
// (PROGRAM.md §3.6).
export const THREADS_PATH = '/threads' // A8: anchored threads (router/docsThreads.go)
