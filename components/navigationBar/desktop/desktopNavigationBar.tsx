"use client"

import React, {useEffect, useMemo, useState} from "react";
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from "@/components/ui/resizable";
import {cn} from "@/lib/utils/helpers/cn";
import {DesktopChildrenNavType, DesktopNavType} from "@/types/nav";
import {
    CircleCheck,
    ClipboardList,
    Home,
    Users,
    Hash,
    Shield,
    Dot,
    MessageCircle,
    FileIcon,
    BellIcon,
    Calendar
} from "lucide-react";
import {DesktopSideNavigationBar} from "@/components/navigationBar/desktop/desktopSideNavigationBar";
import DesktopNavigationTopBar from "@/components/navigationBar/desktop/desktopNavigationTopBar";
import {useFetch} from "@/hooks/useFetch";
import {UserDMInterface, UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {
    app_channel_path,
    app_chat_path,
    app_project_path,
    app_project_team,
    app_my_task_path,
    app_calendar_path,
    app_grp_chat_path, app_team_path, app_doc_path, app_doc_activity, app_admin
} from "@/types/paths";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {usePathname} from "next/navigation";
import {getOtherUserId} from "@/lib/utils/getOtherUserId";
import type {RootState} from "@/store/store";
import {
    createUserChannelList,
    createUserChatList,
    createUserProjectList,
    setTotalUnreadActivityCount,
    createUserTeamList, updateUsersStatusFromList
} from "@/store/slice/userSlice";
import {sortChannelList} from "@/lib/utils/sortChannelList";
import {sortChatList} from "@/lib/utils/sortChatList";
import {formatCount} from "@/lib/utils/helpers/formatCount";


export function DesktopNavigationBar({
                                        children,
                                    }: Readonly<{
    children: React.ReactNode;
}>) {

    const dispatch = useDispatch();

    const path = usePathname().split('/')
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [panelSizes, setPanelSizes] = useState([16, 84]); // Default sizes

    const [isProjectOpen, setIsProjectOpen] = useState(false);
    const [isTeamOpen, setIsTeamOpen] = useState(false);
    const [isChannelOpen, setIsChannelOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const userSideNav = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
        revalidateOnFocus: false,
        dedupingInterval: 30000, // 30 seconds
    })

    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)


    const projectNavGrp = [] as DesktopChildrenNavType[]
    const teamNavGrp = [] as DesktopChildrenNavType[]
    const channelNavGrp = [] as DesktopChildrenNavType[]
    const dmNavGrp = [] as DesktopChildrenNavType[]

    const channelCallStatus = useSelector((state: RootState) => state.channel.channelCallStatus);
    const chatCallStatus = useSelector((state: RootState) => state.chat.chatCallStatus);


    useEffect(() => {
        if(userSideNav.data?.data?.user_teams) {
            dispatch(createUserTeamList({teamUsers: userSideNav.data?.data.user_teams}))
        }

        if(userSideNav.data?.data?.user_projects) {
            dispatch(createUserProjectList({projectUsers: userSideNav.data?.data.user_projects}))
        }

        if(userSideNav.data?.data?.user_channels) {
            dispatch(createUserChannelList({channelsUser: userSideNav.data.data.user_channels}))
        }

        if (userSideNav.data?.data?.user_dms) {
            const otherUsersList = userSideNav.data.data.user_dms.reduce<UserProfileDataInterface[]>((acc, dm) => {
                const originalUser = dm.dm_chats?.[0]?.chat_to || dm.dm_chats?.[0]?.chat_from || userSideNav.data?.data || {} as UserProfileDataInterface;

                // Create a new object instead of mutating the original
                const otherUser = {
                    ...originalUser,
                    user_dms: [JSON.parse(JSON.stringify(dm))]
                };

                return [...acc, otherUser];
            }, []);



            dispatch(createUserChatList({ chatUsersDm: userSideNav.data.data.user_dms }));
            dispatch(updateUsersStatusFromList({ users: otherUsersList }));
        }

        if(userSideNav.data?.data?.user_total_unread_activity_count !== undefined) {
            dispatch(setTotalUnreadActivityCount({count: userSideNav.data.data.user_total_unread_activity_count}))
        }

    }, [userSideNav.data?.data]);

    const navCollapsedSize = 4;

    const totalDMUnread = useMemo(() => 
        (userSidebarState.userChats || []).reduce((acc, chat) => acc + (chat.dm_unread || 0), 0),
        [userSidebarState.userChats]
    );

    const totalChannelUnread = useMemo(() => 
        (userSidebarState.userChannels || []).reduce((acc, channel) => acc + (channel.unread_post_count || 0), 0),
        [userSidebarState.userChannels]
    );

    const navLinks:DesktopNavType[] = useMemo(() => [
        {
            title: 'Home',
            label: formatCount(totalChannelUnread),
            icon: Home,
            variant: (path.length > 2 && path[2] == 'channel') ? "sidebarActive" : "ghost",
            path: app_channel_path,
        },
        {
            title: 'My Tasks',
            label: "",
            icon: CircleCheck,
            variant: (path.length > 2 && path[2] == 'myTask') ? "sidebarActive" : "ghost",
            path: app_my_task_path,
        },
        {
            title: 'Calendar',
            label: "",
            icon: Calendar,
            variant: (path.length > 2 && path[2] == 'calendar') ? "sidebarActive" : "ghost",
            path: app_calendar_path,
        },
        {
            title: 'Activity',
            label: formatCount(userSidebarState.totalUnreadActivityCount),
            icon: BellIcon,
            variant: (path.length > 2 && path[2] == 'activity') ? "sidebarActive" : "ghost",
            path: app_doc_activity,
        },

        {
            title: 'Docs',
            label: "",
            icon: FileIcon,
            variant: (path.length > 2 && path[2] == 'doc') ? "sidebarActive" : "ghost",
            path: app_doc_path,
        },
        {
            title: "DMs",
            label: formatCount(totalDMUnread),
            icon: MessageCircle,
            variant: (path.length > 2 && path[2] == 'chat') ? "sidebarActive" : "ghost",
            path: app_chat_path,
        }
    ], [path, userSidebarState.totalUnreadActivityCount, totalDMUnread]);

    const channelLabel = formatCount(totalChannelUnread);
    const dmLabel = formatCount(totalDMUnread);


    const isAdmin = userSideNav.data && userSideNav.data.data.user_is_admin
    if(isAdmin) {
        navLinks.push({
            title: 'Admin',
            label: "",
            icon: Shield,
            variant: "ghost",
            path: app_admin,
        })
    }

    for (const p of (userSidebarState.userProjects || []).filter(Boolean)) {
        projectNavGrp.push({
            title: p.project_name,
            path: `${app_project_path}/${p.project_uuid}`,
            variant:(path.length > 3 && path[3] == p.project_uuid) ? "sidebarActive" : "ghost",
            project_uuid: p.project_uuid
        })
    }

    for (const t of (userSidebarState.userTeams || []).filter(Boolean)) {
        teamNavGrp.push({
            title: t.team_name,
            path: `${app_project_team}/${t.team_uuid}`,
            variant: (path.length > 3 && path[3] == t.team_uuid) ? "sidebarActive" : "ghost",
        })
    }

    for (const c of sortChannelList((userSidebarState.userChannels || []).filter(Boolean))) {
        channelNavGrp.push({
            title: c.ch_name,
            unread_count: c?.unread_post_count,
            path: `${app_channel_path}/${c.ch_uuid}`,
            variant: (path.length > 3 && path[3] == c.ch_uuid) ? "sidebarActive" : "ghost",
            isCallActive: channelCallStatus[c.ch_uuid]?.active || false,
        })
    }


    for (const d of sortChatList((userSidebarState.userChats || []).filter(Boolean))) {
        let p = ''
        let v: "default" | "ghost" | "sidebarActive"

        const dm_participants = d.dm_participants.filter((t) => t && t.user_uuid != userSideNav.data?.data?.user_uuid)

        if(dm_participants.length > 1) {

            p = `${app_grp_chat_path}/${d.dm_grouping_id}`
            v =  (path.length > 4 && path[4] == d.dm_grouping_id) ? "sidebarActive" : "ghost"
        }else {
            const u = getOtherUserId(d.dm_grouping_id, userSideNav.data?.data.user_uuid ||'')
            p = `${app_chat_path}/${u}`
            v =  (path.length > 3 && path[3] == u) ? "sidebarActive" : "ghost"
        }

        dmNavGrp.push({
            title: dm_participants.length == 0 ? userSideNav.data?.data.user_name || '' : dm_participants.map((item) => item?.user_name).join(","),
            userParticipants: dm_participants.length > 1 ? dm_participants : [],
            unread_count: d?.dm_unread,
            userProfile: dm_participants.length == 0 ? d.dm_participants[0] : (dm_participants.length == 1 ? dm_participants[0] : undefined),
            path: p,
            variant: v,
            isCallActive: chatCallStatus[d.dm_grouping_id]?.active || false,
        })
    }

    const secondaryNavLinks:DesktopNavType[] = [
        {
            title: 'projects',
            label: "",
            icon: ClipboardList,
            variant: "ghost",
            path: "#",
            action: ()=>{dispatch(openUI({ key: 'createProject' }))},
            isOpen: isProjectOpen,
            setIsOpen: setIsProjectOpen,
            children: projectNavGrp
        },
        {
            title: 'teams',
            label: "",
            icon: Users,
            variant: "ghost",
            path: "#",
            action: isAdmin ? ()=>{dispatch(openUI({ key: 'createTeam' }))} : undefined,
            isOpen: isTeamOpen,
            setIsOpen: setIsTeamOpen,
            children: teamNavGrp
        },
        {
            title: 'channels',
            label: channelLabel,
            icon: Hash,
            variant: "ghost",
            path: "#",
            action: ()=>{dispatch(openUI({ key: 'createChannel' }))},
            isOpen: isChannelOpen,
            setIsOpen: setIsChannelOpen,
            children: channelNavGrp
        },

        {
            title: 'chats',
            label: dmLabel,
            icon: MessageCircle,
            variant: "ghost",
            path: "#",
            action: ()=>{dispatch(openUI({ key: 'createChatMessage' }))},
            isOpen: isChatOpen,
            setIsOpen: setIsChatOpen,
            children: dmNavGrp
        },




    ];

    useEffect(() => {
        // Read the layout cookie
        const layoutCookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('react-resizable-root-panels:layout:mail='));
        if (layoutCookie) {
            const layoutSizes = JSON.parse(layoutCookie.split('=')[1]);
            setPanelSizes(layoutSizes);
        }

        // Read the collapsed state cookie
        const collapsedCookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('react-resizable-root-panels:collapsed='));
        if (collapsedCookie) {
            const isCollapsed = JSON.parse(collapsedCookie.split('=')[1]);
            setIsCollapsed(isCollapsed);
        }
    }, []);

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <DesktopNavigationTopBar />
            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup
                    direction="horizontal"
                    onLayout={(sizes) => {
                        document.cookie = `react-resizable-root-panels:layout:mail=${JSON.stringify(sizes)}`
                    }}
                    className="h-full"
                >
                    <ResizablePanel
                        defaultSize={panelSizes[0]}
                        collapsedSize={navCollapsedSize}
                        collapsible={true}
                        minSize={15}
                        maxSize={18}
                        onCollapse={() => {
                            setIsCollapsed(true)
                            document.cookie = `react-resizable-root-panels:collapsed=${JSON.stringify(true)}`
                        }}
                        onExpand={() => {
                            setIsCollapsed(false)
                            document.cookie = `react-resizable-root-panels:collapsed=${JSON.stringify(false)}`
                        }}
                        className={cn("flex flex-col overflow-hidden bg-sidebar", isCollapsed && "min-w-[0.5rem] transition-all duration-300 ease-in-out")}
                    >
                        <DesktopSideNavigationBar isCollapsed={isCollapsed} links={navLinks} />
                        <div className="flex-1 border-t-2 overflow-y-scroll pb-4">
                            <DesktopSideNavigationBar isCollapsed={isCollapsed} links={secondaryNavLinks} />
                        </div>
                        {!isCollapsed && <div className="h-[8vh] border-t-2 pb-4 text-muted-foreground flex justify-center items-end text-xs text-center ">
                            {`Made with ❤️ by Onemana`}
                        </div>}
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={panelSizes[1]} minSize={20} className="overflow-y-auto overflow-x-hidden w-full min-w-0">
                        {children}
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>


    );
}