/**
 * The people area's API endpoints: what only people code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum PeopleGet {
    UsersListWhoDontBelongToTheTeam="user/usersListWhoDontBelongToTheTeam",
    CheckTeamNameAvailability = "/team/checkTeamNameExist",
    ChannelMemberInfoWithAdminFlagInfo = "/ch/channelInfoWithMemberAdminFlag",
    GetUserStatuses = "/user/getAllUserEmojiStatusList",
    GetTeamMemberInfo = "/team/membersInfo",
    GetGuestGrants = "/admin/guest-grants",
}

export enum PeoplePost {
    CreateGuestLink = "/guest/links",
    SetGuestAccess = "/admin/guest-access",
    UpdateGoogleCalendarSyncTask = "/integration/google-calendar/sync-task",
}
