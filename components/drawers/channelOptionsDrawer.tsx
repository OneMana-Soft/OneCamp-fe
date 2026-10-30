"use client"

import { Bell, Clapperboard, MessageSquare, Star, Users, Video } from "@/lib/icons"
import { toggleUserChannelFavorite } from "@/store/slice/userSlice"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { SheetCancel, SheetGroup } from "@/components/ui/sheet-menu"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { useEffect, useState } from "react"
import { usePost } from "@/hooks/usePost"
import { getNextNotification } from "@/lib/utils/getNextNotification"
import { useChannelNotification } from "@/hooks/useConversationNotification"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
    ChannelInfoInterfaceResp,
    NotificationType,
} from "@/types/channel"
import { openChannelDetails } from "@/components/channel/details/openChannelDetails"
import { openUI } from "@/store/slice/uiSlice"
import { useFetch } from "@/hooks/useFetch"
import { app_channel_call } from "@/types/paths"
import { useRouter } from "next/navigation"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { FeatureGate } from "@/components/common/withFeature"
import { FEATURE_CALLS } from "@/hooks/useClientConfig"
import { WorkspaceName } from "@/hooks/useWorkspaceName"

interface ChannelOptionsDrawerProps {
    drawerOpenState: boolean
    channelId: string
    setOpenState: (state: boolean) => void
}

export function ChannelOptionsDrawer({
    drawerOpenState,
    setOpenState,
    channelId,
}: ChannelOptionsDrawerProps) {
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(
        `${channelId ? GetEndpointUrl.ChannelBasicInfo + "/" + channelId : ""}`,
    )

    // A tap moves to the next level, through the one write the header and
    // Details use: shown at once, the sidebar told, a refusal said and undone.
    const notification = useChannelNotification(channelId, channelInfo.data?.channel_info.notification_type, channelInfo.data?.channel_info.ch_name)
    const channelNotification = notification.level
    const updateNotification = () => notification.choose(getNextNotification(channelNotification))

    const dispatch = useDispatch()
    const router = useRouter()

    // Favourite, which the phone bar's star held before the bar became the
    // one conversation title (design v3 chat, C62).
    const postFav = usePost()
    const [favourite, setFavourite] = useState(false)
    useEffect(() => {
        setFavourite(!!channelInfo.data?.channel_info.ch_is_user_fav)
    }, [channelInfo.data?.channel_info.ch_is_user_fav])
    const toggleFavourite = async () => {
        const next = !favourite
        setFavourite(next)
        dispatch(toggleUserChannelFavorite({ channelUUID: channelId, isFavorite: next }))
        try {
            await postFav.makeRequest({ apiEndpoint: next ? PostEndpointUrl.AddFavChannel : PostEndpointUrl.RemoveFavChannel, appendToUrl: `/${channelId}` })
        } catch {
            setFavourite(!next)
            dispatch(toggleUserChannelFavorite({ channelUUID: channelId, isFavorite: !next }))
        }
    }

    const closeDrawer = () => setOpenState(false)
    const callActive = useSelector((state: RootState) => state.channel.channelCallStatus[channelId]?.active || false) || !!channelInfo.data?.channel_info.ch_call_active

    const notificationDescription =
        channelNotification === NotificationType.NotificationAll
            ? "All messages"
            : channelNotification === NotificationType.NotificationMention
              ? "Mentions only"
              : "Muted"

    return (
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>
                        <WorkspaceName />
                    </DrawerTitle>
                    <DrawerDescription>Channel options</DrawerDescription>
                </DrawerHeader>
                <div className="pb-2">
                    <SheetGroup label="Channel">
                    {/* An icon like every other row: it had none, so its words
                        started where the others' icons do, and its bell was a
                        second button inside the row's own. */}
                    <DrawerItem
                        icon={Bell}
                        label="Notifications"
                        description={notificationDescription}
                        onClick={updateNotification}
                    />

                    <DrawerItem
                        icon={Star}
                        label={favourite ? "Remove from favourites" : "Add to favourites"}
                        onClick={toggleFavourite}
                    />

                    {/* One Details sheet (design v3 chat, C49): the channel's
                        about, members, agents, settings and leave. */}
                    <DrawerItem
                        icon={Users}
                        label="Details and members"
                        onClick={() => {
                            dispatch(openChannelDetails(channelId))
                            closeDrawer()
                        }}
                    />

                    <DrawerItem
                        icon={MessageSquare}
                        label="Check-ins"
                        onClick={() => {
                            dispatch(
                                openUI({
                                    key: "channelCheckIns",
                                    data: { channelUUID: channelId },
                                }),
                            )
                            closeDrawer()
                        }}
                    />
                    </SheetGroup>

                    <SheetGroup label="Calls">
                    {/* Calls need a LiveKit server, which the shipped stack does not include.
                        Hidden rather than shown-and-failing when the operator has not run one. */}
                    <FeatureGate feature={FEATURE_CALLS}>
                    <DrawerItem
                        icon={Video}
                        // As the desktop header says it: "Join call" offered to
                        // join a call nobody had started.
                        label={callActive ? "Join the call in progress" : "Start a call"}
                        onClick={() => {
                            closeDrawer()
                            router.push(app_channel_call + "/" + channelId)
                        }}
                    />
                    </FeatureGate>

                    <DrawerItem
                        icon={Clapperboard}
                        label="Call recordings"
                        onClick={() => {
                            closeDrawer()
                            router.push(`/app/channel/${channelId}/recording`)
                        }}
                    />
                    </SheetGroup>
                    <SheetCancel />
                </div>
            </DrawerContent>
        </Drawer>
    )
}
