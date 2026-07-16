"use client"

import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import {
    createUserChannelList,
    createUserChatList,
    createUserProjectList,
    createUserTeamList,
    createUserDocList,
    createUserBoardList,
    setTotalUnreadActivityCount,
    updateUsersStatusFromList,
} from "@/store/slice/userSlice"
import { batchUpdateChannelCallStatus } from "@/store/slice/channelSlice"
import { batchUpdateChatCallStatus } from "@/store/slice/chatSlice"

// useHydrateUserSidebar is the SINGLE source of truth for seeding the sidebar
// Redux state (channels, DMs, projects, teams, docs, boards, call status, and
// the unread counts that drive the nav badges) from the server's sidenav
// endpoint. It must be mounted by EVERY top-level layout — desktop AND the
// mobile PWA — so the authoritative counts (and their 30s revalidation) are
// hydrated the same way everywhere. Previously this lived only inside
// DesktopNavigationBar, so on mobile the nav badges were never seeded/refreshed
// and drifted (stale MQTT increments with no authoritative baseline). Returns
// the SWR response so a caller can also read profile fields (e.g. is_admin).
export function useHydrateUserSidebar() {
    const dispatch = useDispatch()

    const userSideNav = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
        revalidateOnFocus: false,
        dedupingInterval: 30000, // 30 seconds; SWR dedups across all mounts
    })

    useEffect(() => {
        const data = userSideNav.data?.data
        if (!data) return

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

            dispatch(createUserChatList({ chatUsersDm: data.user_dms }))
            dispatch(updateUsersStatusFromList({ users: otherUsersList }))

            const activeDmIds = (data.user_dms || [])
                .filter((dm) => dm.dm_call_active)
                .map((dm) => dm.dm_grouping_id)
            if (activeDmIds.length > 0) {
                dispatch(batchUpdateChatCallStatus({ grpIds: activeDmIds, callStatus: true }))
            }
        }

        if (data.user_total_unread_activity_count !== undefined) {
            dispatch(setTotalUnreadActivityCount({ count: data.user_total_unread_activity_count }))
        }

        if (data.user_docs) {
            dispatch(createUserDocList({ docUsers: data.user_docs }))
        }

        if (data.user_boards) {
            dispatch(createUserBoardList({ boardUsers: data.user_boards }))
        }
    }, [userSideNav.data?.data, dispatch])

    return userSideNav
}
