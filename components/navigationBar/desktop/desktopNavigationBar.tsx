"use client"

import React, {useEffect, useMemo, useRef, useState} from "react";
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import {cn} from "@/lib/utils/helpers/cn";
import {DesktopChildrenNavType, DesktopNavType} from "@/types/nav";
import { Home, Users, Hash, Shield, MessageCircle, Calendar, Clock, Star, Table as TableIcon, Sparkles } from "@/lib/icons";
import { CircleCheck, ClipboardList, Dot, File as FileIcon, LayoutDashboard, Bell as BellIcon, PanelLeftClose, PanelLeftOpen } from "@/lib/icons";
import {DesktopSideNavigationBar} from "@/components/navigationBar/desktop/desktopSideNavigationBar";
import DesktopNavigationTopBar from "@/components/navigationBar/desktop/desktopNavigationTopBar";
import {useFetch} from "@/hooks/useFetch";
import {UserDMInterface, UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {
    app_home_path,
    app_channel_path,
    app_chat_path,
    app_project_path,
    app_project_team,
    app_my_task_path,
    app_calendar_path,
    app_grp_chat_path, app_team_path, app_doc_path, app_board_path, app_doc_activity, app_admin, app_tables_path, app_templates_path
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
    createUserTeamList, updateUsersStatusFromList,
    createUserDocList,
    createUserBoardList
} from "@/store/slice/userSlice";
import {sortChannelList} from "@/lib/utils/sortChannelList";
import {InlineDocCreator} from "@/components/doc/inlineDocCreator";
import {InlineBoardCreator} from "@/components/board/inlineBoardCreator";
import {sortChatList} from "@/lib/utils/sortChatList";
import {isExternalUser} from "@/lib/utils/isExternalUser";
import {formatCount} from "@/lib/utils/helpers/formatCount";
import {batchUpdateChannelCallStatus} from "@/store/slice/channelSlice";
import {batchUpdateChatCallStatus} from "@/store/slice/chatSlice";


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
    const [isRecentOpen, setIsRecentOpen] = useState(true);
    const [isFavOpen, setIsFavOpen] = useState(true);
    const [isDocsOpen, setIsDocsOpen] = useState(false);
    const [isDocCreatorOpen, setIsDocCreatorOpen] = useState(false);
    const [isBoardsOpen, setIsBoardsOpen] = useState(false);
    const [isBoardCreatorOpen, setIsBoardCreatorOpen] = useState(false);

    const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

    const userSideNav = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
        revalidateOnFocus: false,
        dedupingInterval: 30000, // 30 seconds
    })

    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)
    const recentItems = useSelector((state: RootState) => state.recentItems.items)

    const projectNavGrp = [] as DesktopChildrenNavType[]
    const teamNavGrp = [] as DesktopChildrenNavType[]
    const channelNavGrp = [] as DesktopChildrenNavType[]
    const dmNavGrp = [] as DesktopChildrenNavType[]
    const recentNavGrp = [] as DesktopChildrenNavType[]

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
            dispatch(createUserChannelList({
                channelsUser: userSideNav.data.data.user_channels,
                favChannelsUser: userSideNav.data.data.user_fav_channels || []
            }))

            // Hydrate channel call status from initial sidebar API (single batch dispatch)
            const activeChannelIds = (userSideNav.data.data.user_channels || [])
                .filter(ch => ch.ch_call_active)
                .map(ch => ch.ch_uuid);
            if (activeChannelIds.length > 0) {
                dispatch(batchUpdateChannelCallStatus({ channelIds: activeChannelIds, callStatus: true }));
            }
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

            // Hydrate DM/group chat call status from initial sidebar API (single batch dispatch)
            const activeDmIds = (userSideNav.data.data.user_dms || [])
                .filter(dm => dm.dm_call_active)
                .map(dm => dm.dm_grouping_id);
            if (activeDmIds.length > 0) {
                dispatch(batchUpdateChatCallStatus({ grpIds: activeDmIds, callStatus: true }));
            }
        }

        if(userSideNav.data?.data?.user_total_unread_activity_count !== undefined) {
            dispatch(setTotalUnreadActivityCount({count: userSideNav.data.data.user_total_unread_activity_count}))
        }

        if(userSideNav.data?.data?.user_docs) {
            dispatch(createUserDocList({docUsers: userSideNav.data.data.user_docs}))
        }

        if(userSideNav.data?.data?.user_boards) {
            dispatch(createUserBoardList({boardUsers: userSideNav.data.data.user_boards}))
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

    const isAdmin = userSideNav.data && userSideNav.data.data.user_is_admin

    const navLinks:DesktopNavType[] = useMemo(() => {
        const links: DesktopNavType[] = [
            {
                title: 'Home',
                label: "",
                icon: Home,
                variant: (path.length > 2 && path[2] == 'home') ? "sidebarActive" : "ghost",
                path: app_home_path,
            },
            {
                title: 'Channels',
                label: formatCount(totalChannelUnread),
                icon: Hash,
                variant: (path.length > 2 && path[2] == 'channel') ? "sidebarActive" : "ghost",
                path: app_channel_path,
            },
            {
                title: 'DMs',
                label: formatCount(totalDMUnread),
                icon: MessageCircle,
                variant: (path.length > 2 && path[2] == 'chat') ? "sidebarActive" : "ghost",
                path: app_chat_path,
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
                title: 'Tables',
                label: "",
                icon: TableIcon,
                variant: (path.length > 2 && path[2] == 'tables') ? "sidebarActive" : "ghost",
                path: app_tables_path,
            },
            {
                title: 'Templates',
                label: "",
                icon: Sparkles,
                variant: (path.length > 2 && path[2] == 'templates') ? "sidebarActive" : "ghost",
                path: app_templates_path,
            },
            {
                title: 'Activity',
                label: formatCount(userSidebarState.totalUnreadActivityCount),
                icon: BellIcon,
                variant: (path.length > 2 && path[2] == 'activity') ? "sidebarActive" : "ghost",
                path: app_doc_activity,
            },
        ];
        if (isAdmin) {
            links.push({
                title: 'Admin',
                label: "",
                icon: Shield,
                variant: (path.length > 2 && path[2] == 'admin') ? "sidebarActive" : "ghost",
                path: app_admin,
            });
        }
        return links;
    }, [path, userSidebarState.totalUnreadActivityCount, totalDMUnread, totalChannelUnread, isAdmin]);

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

    const favChannelUUIDs = new Set(
        (userSidebarState.userFavChannels || []).map(f => f.ch_uuid)
    );

    // Build favorites list
    const favChannelNavGrp = [] as DesktopChildrenNavType[];
    for (const c of sortChannelList((userSidebarState.userFavChannels || []).filter(Boolean), favChannelUUIDs)) {
        favChannelNavGrp.push({
            title: c.ch_name,
            unread_count: c?.unread_post_count,
            path: `${app_channel_path}/${c.ch_uuid}`,
            variant: (path.length > 3 && path[3] == c.ch_uuid) ? "sidebarActive" : "ghost",
            isCallActive: channelCallStatus[c.ch_uuid]?.active || false,
            isFavorite: true,
        })
    }

    // Build regular channels list (non-favorites only)
    const nonFavChannels = (userSidebarState.userChannels || []).filter(c => !favChannelUUIDs.has(c.ch_uuid));
    for (const c of sortChannelList(nonFavChannels.filter(Boolean))) {
        channelNavGrp.push({
            title: c.ch_name,
            unread_count: c?.unread_post_count,
            path: `${app_channel_path}/${c.ch_uuid}`,
            variant: (path.length > 3 && path[3] == c.ch_uuid) ? "sidebarActive" : "ghost",
            isCallActive: channelCallStatus[c.ch_uuid]?.active || false,
            isFavorite: false,
        })
    }


    for (const d of sortChatList((userSidebarState.userChats || []).filter(Boolean))) {
        let p = ''
        let v: "default" | "ghost" | "sidebarActive"

        const dm_participants = d.dm_participants.filter((t) => t && t.user_uuid != userSideNav.data?.data?.user_uuid)

        // External users can't be DMed. Defence-in-depth — drop any DM
        // entry whose only other participant is external so they never
        // surface as a clickable DM in the sidebar.
        if (dm_participants.length === 1 && isExternalUser(dm_participants[0])) {
            continue
        }

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

    for (const item of recentItems.slice(0, 8)) {
        const typeIconMap: Record<string, any> = {
            task: CircleCheck,
            channel: Hash,
            doc: FileIcon,
            project: ClipboardList,
            team: Users,
            chat: MessageCircle,
            user: Users,
        };
        recentNavGrp.push({
            title: item.title,
            path: item.path,
            variant: path.join('/') === item.path.slice(1) ? "sidebarActive" : "ghost",
            icon: typeIconMap[item.type] || CircleCheck,
        });
    }

    const recentNavLinks: DesktopNavType[] = recentNavGrp.length > 0 ? [
        {
            title: 'Recent',
            label: "",
            icon: Clock,
            variant: "ghost",
            path: "#",
            isOpen: isRecentOpen,
            setIsOpen: setIsRecentOpen,
            children: recentNavGrp,
        },
    ] : [];

    const favNavLinks: DesktopNavType[] = favChannelNavGrp.length > 0 ? [
        {
            title: 'Favorites',
            label: "",
            icon: Star,
            variant: "ghost",
            path: "#",
            isOpen: isFavOpen,
            setIsOpen: setIsFavOpen,
            children: favChannelNavGrp,
        },
    ] : [];

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
            label: "",
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
            label: "",
            icon: MessageCircle,
            variant: "ghost",
            path: "#",
            action: ()=>{dispatch(openUI({ key: 'createChatMessage' }))},
            isOpen: isChatOpen,
            setIsOpen: setIsChatOpen,
            children: dmNavGrp
        },
        {
            title: 'Docs',
            label: "",
            icon: FileIcon,
            variant: "ghost",
            path: "#",
            isOpen: isDocsOpen,
            setIsOpen: setIsDocsOpen,
            action: () => setIsDocCreatorOpen((prev) => !prev),
            children: [
                {
                    title: "All docs",
                    path: app_doc_path,
                    variant: (path.length === 3 && path[2] == 'doc') ? "sidebarActive" : "ghost",
                    icon: FileIcon,
                } as DesktopChildrenNavType,
                ...(userSidebarState.userDocs || []).map((d): DesktopChildrenNavType => ({
                    title: d.doc_title,
                    path: `${app_doc_path}/${d.doc_uuid}`,
                    variant: (path.length > 3 && path[3] == d.doc_uuid) ? "sidebarActive" : "ghost",
                    icon: FileIcon,
                })),
            ],
            inlineCreator: <InlineDocCreator isOpen={isDocCreatorOpen} onOpenChange={setIsDocCreatorOpen} />,
        },
        {
            title: 'Boards',
            label: "",
            icon: LayoutDashboard,
            variant: "ghost",
            path: "#",
            isOpen: isBoardsOpen,
            setIsOpen: setIsBoardsOpen,
            action: () => setIsBoardCreatorOpen((prev) => !prev),
            children: [
                {
                    title: "All boards",
                    path: app_board_path,
                    variant: (path.length === 3 && path[2] == 'board') ? "sidebarActive" : "ghost",
                    icon: LayoutDashboard,
                } as DesktopChildrenNavType,
                ...(userSidebarState.userBoards || []).map((b): DesktopChildrenNavType => ({
                    title: b.board_title,
                    path: `${app_board_path}/${b.board_uuid}`,
                    variant: (path.length > 3 && path[3] == b.board_uuid) ? "sidebarActive" : "ghost",
                    icon: LayoutDashboard,
                })),
            ],
            inlineCreator: <InlineBoardCreator isOpen={isBoardCreatorOpen} onOpenChange={setIsBoardCreatorOpen} />,
        },
    ];

    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        // Read the collapsed state cookie
        const collapsedCookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('react-resizable-root-panels:collapsed='));
        
        const savedCollapsed = collapsedCookie 
            ? JSON.parse(collapsedCookie.split('=')[1]) 
            : false; // Default to expanded

        // Read the layout cookie — but only apply if it matches collapsed state
        const layoutCookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('react-resizable-sidebar-panels:layout:mail='));
        
        let targetSizes: number[];
        
        if (layoutCookie) {
            const layoutSizes = JSON.parse(layoutCookie.split('=')[1]);
            const sidebarWidth = layoutSizes[0];
            // Sanity check: if saved as expanded but sidebar width < 8%,
            // or saved as collapsed but sidebar width > 8%, reset to defaults
            const looksCollapsed = sidebarWidth < 8;
            if (savedCollapsed !== looksCollapsed) {
                // Cookie mismatch — use defaults matching saved collapsed state
                targetSizes = savedCollapsed ? [4, 96] : [16, 84];
            } else {
                targetSizes = layoutSizes;
            }
        } else {
            // No layout cookie — use defaults matching collapsed state
            targetSizes = savedCollapsed ? [4, 96] : [16, 84];
        }

        setIsCollapsed(savedCollapsed);
        setPanelSizes(targetSizes);

        // CRITICAL: Imperatively sync panel width with cookie state.
        // defaultSize only applies on mount; state updates don't resize the panel.
        // Without this, the panel stays at its initial defaultSize while isCollapsed
        // reflects the cookie, causing "expanded width + collapsed content" mismatch.
        const panel = sidebarPanelRef.current;
        if (panel) {
            if (savedCollapsed) {
                panel.collapse();
            } else {
                panel.resize(targetSizes[0]);
            }
        }
    }, []);

    const layoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleLayout = (sizes: number[]) => {
        if (layoutTimeoutRef.current) {
            clearTimeout(layoutTimeoutRef.current);
        }
        layoutTimeoutRef.current = setTimeout(() => {
            document.cookie = `react-resizable-sidebar-panels:layout:mail=${JSON.stringify(sizes)}; path=/; max-age=31536000`;
        }, 300);
    };

    return (
        <div className="flex flex-col h-dvh overflow-hidden">
            <DesktopNavigationTopBar />
            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup
                    direction="horizontal"
                    onLayout={handleLayout}
                    className="h-full"
                >
                    <ResizablePanel
                        ref={sidebarPanelRef}
                        defaultSize={panelSizes[0]}
                        collapsedSize={navCollapsedSize}
                        collapsible={true}
                        minSize={15}
                        maxSize={18}
                        onCollapse={() => {
                            setIsCollapsed(true)
                            setTimeout(() => {
                                document.cookie = `react-resizable-root-panels:collapsed=${JSON.stringify(true)}; path=/; max-age=31536000`
                            }, 0)
                        }}
                        onExpand={() => {
                            setIsCollapsed(false)
                            setTimeout(() => {
                                document.cookie = `react-resizable-root-panels:collapsed=${JSON.stringify(false)}; path=/; max-age=31536000`
                            }, 0)
                        }}
                        className={cn(
                            "flex flex-col overflow-hidden bg-sidebar will-change-[flex-basis]",
                            // Disable transitions only when actively dragging AND fully expanded, 
                            // to ensure the snap animation to/from collapsed state is smooth.
                            isDragging && !isCollapsed ? "transition-none" : "transition-[flex-basis] duration-100 ease-out",
                            isCollapsed && "min-w-[0.5rem]"
                        )}
                    >
                        <DesktopSideNavigationBar isCollapsed={isCollapsed} links={navLinks} />
                        {favNavLinks.length > 0 && (
                            <div className="border-t border-border/30 pt-2">
                                <DesktopSideNavigationBar isCollapsed={isCollapsed} links={favNavLinks} />
                            </div>
                        )}
                        {recentNavLinks.length > 0 && (
                            <div className="border-t border-border/30 pt-2">
                                <DesktopSideNavigationBar isCollapsed={isCollapsed} links={recentNavLinks} />
                            </div>
                        )}
                        <div className="flex-1 border-t border-border/40 overflow-y-scroll pb-4">
                            <DesktopSideNavigationBar isCollapsed={isCollapsed} links={secondaryNavLinks} />
                        </div>
                        <div className="h-8 border-t flex items-center justify-center px-1">
                            {isCollapsed ? (
                                <button
                                    onClick={() => {
                                        sidebarPanelRef.current?.expand()
                                    }}
                                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    title="Expand sidebar"
                                >
                                    <PanelLeftOpen className="h-4 w-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        sidebarPanelRef.current?.collapse()
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent"
                                    title="Collapse sidebar"
                                >
                                    <PanelLeftClose className="h-3.5 w-3.5" />
                                    <span>Collapse</span>
                                </button>
                            )}
                        </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle onDragging={setIsDragging} />
                    <ResizablePanel defaultSize={panelSizes[1]} minSize={20} className="overflow-hidden w-full min-w-0">
                        {children}
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>


    );
}