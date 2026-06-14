import { createSlice } from "@reduxjs/toolkit";
import {UserDMInterface, UserEmojiStatus, UserProfileDataInterface, UserStatus} from "@/types/user";
import {ChannelInfoInterface} from "@/types/channel";
import {TeamInfoInterface} from "@/types/team";
import {ProjectInfoInterface} from "@/types/project";
import {DocSidebarInfo} from "@/types/doc";

interface UpdateUserEmojiStatusInterface {
  status: UserEmojiStatus;
  userUUID: string;
}

interface UpdateUserStatusInterface {
  status: string;
  userUUID: string;
}

interface UpdateUserInfoInterface {
  status: string;
  userName: string
  profileKey: string
  userUUID: string;
}

interface UpdateUserConnectedDeviceInterface {
  deviceConnected: number;
  userUUID: string;
}

interface CreateUserStatusInterface {
  users: UserProfileDataInterface[]
}

interface CreateUserChatsInterface {
  chatUsersDm:UserDMInterface[]
}

interface AddUserChatInterface {
  chatUserDm: UserDMInterface
}

interface CreateUserChannelsInterface {
  channelsUser: ChannelInfoInterface[]
  favChannelsUser?: ChannelInfoInterface[]
}

interface RemoveUserChannelInterface {
  channelUUID: string
}

interface UpdateUserChannelInterface {
  channelUUID: string
  channelName: string,
  channelPrivate: boolean
}

interface AddUserChannelInterface {
  channelUser: ChannelInfoInterface
}

interface CrateUserTeamsInterface {
  teamUsers: TeamInfoInterface[]
}

interface CrateUserTeamInterface {
  teamUser: TeamInfoInterface

}

interface UpdateUserProjectInterface {
  projectName: string
  projectUUID: string
}

interface UpdateUserTeamInterface {
  teamName: string
  teamUUID: string
}

interface CrateUserProjectsInterface {
  projectUsers: ProjectInfoInterface[]
}

interface CrateUserProjectInterface {
  projectUser: ProjectInfoInterface

}

interface CreateUserDocsInterface {
  docUsers: DocSidebarInfo[]
}

export interface UserEmojiInterface{
  emojiStatus: UserEmojiStatus;
  status: string;
  deviceConnected: number;
  profileKey : string;
  userName: string;
}


interface UserSidebarInterface {
  userChats:  UserDMInterface[],
  userChannels:  ChannelInfoInterface[],
  userFavChannels:  ChannelInfoInterface[],
  userTeams: TeamInfoInterface[],
  userProjects:  ProjectInfoInterface[],
  userDocs: DocSidebarInfo[],
  totalUnreadActivityCount: number
}

interface ExtendedUserEmojiStatusState {
  [key: string]:  UserEmojiInterface;
}

const initialState = {
  usersStatus: {} as ExtendedUserEmojiStatusState,
  userSidebar: {
    userChats: [],
    userChannels: [],
    userFavChannels: [],
    userTeams: [],
    userProjects: [],
    userDocs: [],
    totalUnreadActivityCount: 0
  } as UserSidebarInterface
};

export const userSlice = createSlice({
  name: "users",
  initialState,
  reducers: {

    /**
     * Set the user's emoji status from a profile / list fetch.
     *
     * IMPORTANT: this reducer treats an empty status (no emoji_id) as
     * "no information" rather than "clear it". Profile fetches
     * (`/user/profile/{userUUID}`, `useFetchOnlyOnce`, etc.) come back
     * without `user_emoji_statuses` whenever the user has no active
     * status — Dgraph filters by expiry and the Go struct has
     * `omitempty`, so the field disappears from the JSON entirely.
     *
     * Before this guard, every chat header re-fetch would clobber the
     * Redux entry with `{}`, making the user's status emoji visibly
     * disappear the moment they (or anyone else) opened a chat —
     * including their own self-chat — even though MQTT had not
     * actually delivered a delete event.
     *
     * Explicit "clear" intent (the user opened the status dialog and
     * cleared it, or an MQTT delete event arrived) flows through
     * `clearUserEmojiStatus` instead, which IS allowed to wipe the
     * cached value.
     */
    updateUserEmojiStatus: (state, action: {payload: UpdateUserEmojiStatusInterface}) => {
      const { userUUID, status } = action.payload;
      if (!userUUID) return;

      // Treat undefined / null / empty payloads as "no info, leave as
      // is". A valid status always carries a non-empty
      // status_user_emoji_id; we use that as the truthiness check.
      const hasValidStatus =
        !!status && typeof status.status_user_emoji_id === "string" && status.status_user_emoji_id.length > 0;
      if (!hasValidStatus) {
        return;
      }

      if (!state.usersStatus[userUUID]) {
        state.usersStatus[userUUID] = {} as UserEmojiInterface;
      }

      state.usersStatus[userUUID].emojiStatus = status;
    },

    /**
     * Explicit "no active emoji status" intent. Use this from:
     *   - MQTT MqttActionType.Delete
     *   - the user's own clear-status dialog
     *
     * Profile-fetch handlers must not call this — they have no way of
     * distinguishing "user actively cleared" from "BE filtered out an
     * expired row".
     */
    clearUserEmojiStatus: (state, action: {payload: {userUUID: string}}) => {
      const { userUUID } = action.payload;
      if (!userUUID) return;

      if (!state.usersStatus[userUUID]) {
        state.usersStatus[userUUID] = {} as UserEmojiInterface;
      }

      state.usersStatus[userUUID].emojiStatus = {} as UserEmojiStatus;
    },

    updateUserStatus: (state, action: {payload: UpdateUserStatusInterface}) => {
      const { userUUID, status } = action.payload;

      if(!state.usersStatus[userUUID]) {
        state.usersStatus[userUUID] = {} as UserEmojiInterface
      }

      state.usersStatus[userUUID].status = status;
    },

    updateUserInfoStatus: (state, action: {payload: UpdateUserInfoInterface}) => {
      const { userUUID, status, profileKey, userName } = action.payload;

      if(!state.usersStatus[userUUID]) {
        state.usersStatus[userUUID] = {} as UserEmojiInterface
      }

      state.usersStatus[userUUID] = {
        ...state.usersStatus[userUUID],
        status,
        profileKey,
        userName,
      };
    },


    updateUsersStatusFromList: (state, action: {payload: CreateUserStatusInterface}) => {

      const {users} = action.payload;

      users.forEach(user => {

        if(!state.usersStatus[user.user_uuid]) {
          state.usersStatus[user.user_uuid] = {} as UserEmojiInterface
        }

        // Same guard as updateUserEmojiStatus: only write when the
        // payload carries a real status row. An empty / missing
        // user_emoji_statuses field on a list response means
        // "no information here", not "clear the cached value".
        const candidate = user.user_emoji_statuses?.[0]
        if (
          candidate &&
          typeof candidate.status_user_emoji_id === "string" &&
          candidate.status_user_emoji_id.length > 0
        ) {
          state.usersStatus[user.user_uuid].emojiStatus = candidate
        }

        if(user.user_status) {
          state.usersStatus[user.user_uuid].status = user.user_status

        }

        if(user.user_device_connected) {
          state.usersStatus[user.user_uuid].deviceConnected = user.user_device_connected

        }

      })

    },

    updateUserConnectedDeviceCount: (state, action: {payload: UpdateUserConnectedDeviceInterface}) => {
      const { userUUID, deviceConnected } = action.payload;

      if(!state.usersStatus[userUUID]) {
        state.usersStatus[userUUID] = {} as UserEmojiInterface
      }

      state.usersStatus[userUUID].deviceConnected = deviceConnected;
    },

    createUserChatList: (state, action: {payload: CreateUserChatsInterface}) => {
      const {chatUsersDm} = action.payload;

      state.userSidebar.userChats = chatUsersDm;
    },

    addUserToUserChatList: (state, action: {payload: AddUserChatInterface}) => {
      const {chatUserDm} = action.payload;

      let found = false

      if(!state.userSidebar.userChats) {
        state.userSidebar.userChats = [] as UserDMInterface[]
      }


      state.userSidebar.userChats = state.userSidebar.userChats.map((item) => {
        if(item.dm_grouping_id == chatUserDm.dm_grouping_id) {
          found = true
          if(item) {
            item.dm_unread = 0
          }
        }

        return item
      })



      if(!found) {
        state.userSidebar.userChats.push(chatUserDm);

      }

    },

    createUserChannelList: (state, action: {payload: CreateUserChannelsInterface}) => {
      const {channelsUser, favChannelsUser} = action.payload;

      state.userSidebar.userChannels = channelsUser;
      if (favChannelsUser) {
        state.userSidebar.userFavChannels = favChannelsUser;
      }
    },

    updateUserChannelName: (state, action: {payload: UpdateUserChannelInterface}) => {
      const {channelName, channelPrivate, channelUUID} = action.payload;

      state.userSidebar.userChannels = state.userSidebar.userChannels.map((item) => {

        if(item.ch_uuid === channelUUID) {
          item.ch_name = channelName;
          item.ch_private = channelPrivate;
        }
        return item;
      });

    },

    removeUserChannelName: (state, action: {payload: RemoveUserChannelInterface}) => {
      const {channelUUID} = action.payload;

      state.userSidebar.userChannels = state.userSidebar.userChannels.filter((item) => item.ch_uuid === channelUUID);

    },

    addUserChannelList: (state, action: {payload: AddUserChannelInterface}) => {
      const {channelUser} = action.payload;

      let found  = false

      if(!state.userSidebar.userChannels) {
        state.userSidebar.userChannels = [] as ChannelInfoInterface[]
      }

      state.userSidebar.userChannels = state.userSidebar.userChannels.map((item) => {
        if(item.ch_uuid == channelUser.ch_uuid) {
          found = true;
          item.unread_post_count = 0
        }
        return item
      })

      if(!found) {
        state.userSidebar.userChannels.push(channelUser);

      }
    },

    createUserTeamList: (state, action: {payload: CrateUserTeamsInterface}) => {
      const {teamUsers} = action.payload;

      state.userSidebar.userTeams = teamUsers;
    },

    addUserTeamList: (state, action: {payload: CrateUserTeamInterface}) => {
      const {teamUser} = action.payload;

      if (!teamUser || !teamUser.team_uuid) {
        return;
      }

      let found  = false

      if(!state.userSidebar.userTeams) {
        state.userSidebar.userTeams = [] as TeamInfoInterface[]
      }

      state.userSidebar.userTeams.forEach((item) => {
        if(item && item.team_uuid == teamUser.team_uuid) {
          found = true;
          return
        }
      })

      if(!found) {
        state.userSidebar.userTeams.push(teamUser);
      }

    },

    updateUserTeamList: (state, action: {payload: UpdateUserTeamInterface}) => {
      const {teamName, teamUUID} = action.payload;

      state.userSidebar.userTeams = state.userSidebar.userTeams.map((item)=>{

        if(item.team_uuid == teamUUID) {
          item.team_name = teamName;
        }

        return item
      })
    },

    updateUserProjectList: (state, action: {payload: UpdateUserProjectInterface}) => {
      const {projectName, projectUUID} = action.payload;

      state.userSidebar.userProjects = state.userSidebar.userProjects.map((item)=>{

        if(item.project_uuid == projectUUID) {
          item.project_name = projectName;
        }

        return item
      })
    },

    createUserProjectList: (state, action: {payload: CrateUserProjectsInterface}) => {
      const {projectUsers} = action.payload;

      state.userSidebar.userProjects = projectUsers;
    },

    createUserDocList: (state, action: {payload: CreateUserDocsInterface}) => {
      const {docUsers} = action.payload;

      state.userSidebar.userDocs = docUsers;
    },

    addUserProjectList: (state, action: {payload: CrateUserProjectInterface}) => {
      const {projectUser} = action.payload;

      if (!projectUser || !projectUser.project_uuid) {
        return;
      }

      let found = false

      if(!state.userSidebar.userProjects) {
        state.userSidebar.userProjects = [] as ProjectInfoInterface[]
      }

      state.userSidebar.userProjects.forEach((item) => {
        if(item && item.project_uuid == projectUser.project_uuid) {
          found = true;
          return
        }
      })

      if(!found) {
        state.userSidebar.userProjects.push(projectUser);
      }
    },

    setTotalUnreadActivityCount: (state, action: {payload: {count: number}}) => {
      state.userSidebar.totalUnreadActivityCount = action.payload.count;
    },

    resetUserChatUnread: (state, action: {payload: {dm_grouping_id: string}}) => {
      const {dm_grouping_id} = action.payload;
      state.userSidebar.userChats = state.userSidebar.userChats.map((item) => {
        if(item.dm_grouping_id == dm_grouping_id) {
          item.dm_unread = 0;
        }
        return item;
      });
    },

    resetUserChannelUnread: (state, action: {payload: {ch_uuid: string}}) => {
      const {ch_uuid} = action.payload;
      state.userSidebar.userChannels = state.userSidebar.userChannels.map((item) => {
        if(item.ch_uuid == ch_uuid) {
          item.unread_post_count = 0;
        }
        return item;
      });
    },

    incrementUserChatUnread: (state, action: {payload: {dm_grouping_id: string}}) => {
      const {dm_grouping_id} = action.payload;
      state.userSidebar.userChats = state.userSidebar.userChats.map((item) => {
        if(item.dm_grouping_id == dm_grouping_id) {
          item.dm_unread = (item.dm_unread || 0) + 1;
        }
        return item;
      });
    },

    incrementUserChannelUnread: (state, action: {payload: {ch_uuid: string}}) => {
      const {ch_uuid} = action.payload;
      state.userSidebar.userChannels = state.userSidebar.userChannels.map((item) => {
        if(item.ch_uuid == ch_uuid) {
          item.unread_post_count = (item.unread_post_count || 0) + 1;
        }
        return item;
      });
    },

    incrementTotalUnreadActivityCount: (state) => {
      state.userSidebar.totalUnreadActivityCount = (state.userSidebar.totalUnreadActivityCount || 0) + 1;
    },

    toggleUserChannelFavorite: (state, action: {payload: {channelUUID: string, isFavorite: boolean}}) => {
      const { channelUUID, isFavorite } = action.payload;
      if (isFavorite) {
        // Find channel in userChannels and add to userFavChannels
        const channel = state.userSidebar.userChannels.find(c => c.ch_uuid === channelUUID);
        if (channel) {
          const exists = state.userSidebar.userFavChannels.find(c => c.ch_uuid === channelUUID);
          if (!exists) {
            state.userSidebar.userFavChannels.push(channel);
          }
        }
      } else {
        // Remove from userFavChannels
        state.userSidebar.userFavChannels = state.userSidebar.userFavChannels.filter(
          c => c.ch_uuid !== channelUUID
        );
      }
    },

  },
});

export const {
  updateUserEmojiStatus,
  clearUserEmojiStatus,
  updateUserStatus,
  updateUserConnectedDeviceCount,
  createUserChatList,
  addUserToUserChatList,
  createUserChannelList,
  updateUserChannelName,
  removeUserChannelName,
  addUserChannelList,
  createUserTeamList,
  addUserTeamList,
  updateUserTeamList,
  createUserProjectList,
  updateUserProjectList,
  addUserProjectList,
  createUserDocList,
  updateUsersStatusFromList,
  updateUserInfoStatus,
  setTotalUnreadActivityCount,
  resetUserChatUnread,
  resetUserChannelUnread,
  incrementUserChatUnread,
  incrementUserChannelUnread,
  incrementTotalUnreadActivityCount,
  toggleUserChannelFavorite,

} = userSlice.actions;

export default userSlice;
