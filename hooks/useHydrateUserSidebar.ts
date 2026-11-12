"use client"

import { useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import { useInboxBadge } from "@/lib/activity/inboxBadge"
import { GetEndpointUrl } from "@/services/endPoints"
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import {
    createUserChannelList,
    createUserChatList,
    createUserProjectList,
    createUserTeamList,
    createUserDocList,
    createUserBoardList,
    setUserStarred,
    updateUsersStatusFromList,
} from "@/store/slice/userSlice"
import { batchUpdateChannelCallStatus } from "@/store/slice/channelSlice"
import { batchUpdateChatCallStatus } from "@/store/slice/chatSlice"
import { withOpenRead } from "@/lib/chat/conversation"
import { dataToSeed } from "@/lib/swrMutate"
import { setProjectOrder } from "@/lib/projectHue"
import type { RootState } from "@/store/store"
import type { Place } from "@/types/docGraph"

/**
 * The sidenav payload, for a component that only reads it. One SWR config for
 * every reader, so they share one request.
 */
export function useSidenav() {
    return useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
        revalidateOnFocus: false,
        dedupingInterval: 30000, // 30 seconds; SWR dedups across all mounts
    })
}

// Seeds the sidebar's Redux state (channels, DMs, projects, teams, docs,
// boards, call status and their unread counts) from the sidenav answer, and
// starts the Inbox badge's own read (lib/activity/inboxBadge). Every top-level
// layout must mount it, desktop and phone alike, or that layout's badges drift.
// It returns the SWR response for profile fields (is_admin); a reader alone
// uses useSidenav, so the lists aren't seeded twice.
export function useHydrateUserSidebar() {
    const dispatch = useDispatch()

    const userSideNav = useSidenav()
    useInboxBadge()

    useEffect(() => {
        // Once per answer: the store is kept current by live updates since.
        const seeded = dataToSeed(GetEndpointUrl.SelfProfileSideNav, userSideNav.data)
        const data = seeded?.data
        if (!data) return

        // The starred pages sit beside the profile in the answer, left out
        // when the server couldn't read them: then the ones shown stay.
        const starred = (seeded as { starred?: unknown }).starred
        if (Array.isArray(starred)) {
            dispatch(setUserStarred({ places: starred as Place[] }))
        }

        if (data.user_teams) {
            dispatch(createUserTeamList({ teamUsers: data.user_teams }))
        }

        if (data.user_projects) {
            dispatch(createUserProjectList({ projectUsers: data.user_projects }))
        }

        if (data.user_channels) {
            dispatch(createUserChannelList({
                channelsUser: data.user_channels,
                favChannelsUser: data.user_fav_channels || [],
            }))

            const activeChannelIds = (data.user_channels || [])
                .filter((ch) => ch.ch_call_active)
                .map((ch) => ch.ch_uuid)
            if (activeChannelIds.length > 0) {
                dispatch(batchUpdateChannelCallStatus({ channelIds: activeChannelIds, callStatus: true }))
            }
        }

        if (data.user_dms) {
            const otherUsersList = data.user_dms.reduce<UserProfileDataInterface[]>((acc, dm) => {
                const originalUser = dm.dm_chats?.[0]?.chat_to || dm.dm_chats?.[0]?.chat_from || data || ({} as UserProfileDataInterface)
                const otherUser = {
                    ...originalUser,
                    user_dms: [JSON.parse(JSON.stringify(dm))],
                }
                return [...acc, otherUser]
            }, [])

            // The conversation on screen is read, whatever this answer predates.
            dispatch(createUserChatList({ chatUsersDm: withOpenRead(data.user_dms, window.location.pathname, data.user_uuid) }))
            dispatch(updateUsersStatusFromList({ users: otherUsersList }))

            const activeDmIds = (data.user_dms || [])
                .filter((dm) => dm.dm_call_active)
                .map((dm) => dm.dm_grouping_id)
            if (activeDmIds.length > 0) {
                dispatch(batchUpdateChatCallStatus({ grpIds: activeDmIds, callStatus: true }))
            }
        }

        if (data.user_docs) {
            dispatch(createUserDocList({ docUsers: data.user_docs }))
        }

        if (data.user_boards) {
            dispatch(createUserBoardList({ boardUsers: data.user_boards }))
        }
    }, [userSideNav.data, dispatch])

    // The reader's projects, oldest first, share the six hues out so no two
    // of them draw the same colour (lib/projectHue).
    const projects = useSelector((s: RootState) => s.users.userSidebar.userProjects)
    useEffect(() => {
        setProjectOrder((projects ?? []).map((p) => p.project_uuid))
    }, [projects])

    return userSideNav
}
