"use client"

import {MobileHomeSearchBar} from "@/components/home/mobile/mobileHomeSearchBar";
import {ClipboardList, FileIcon, FileText, Hash, MessageCircle, Users, Video} from "lucide-react";
import {DesktopChildrenNavType, DesktopNavType} from "@/types/nav";
import {useEffect, useMemo, useState} from "react";
import {DesktopSideNavigationBar} from "@/components/navigationBar/desktop/desktopSideNavigationBar";
import {Separator} from "@/components/ui/separator";
import {
    app_channel_path,
    app_chat_path,
    app_doc_path,
    app_grp_chat_path, app_post_path,
    app_project_path,
    app_project_team, app_recording_activity
} from "@/types/paths";
import {useFetch} from "@/hooks/useFetch";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {useDispatch, useSelector} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {GetEndpointUrl} from "@/services/endPoints";
import {
    createUserChannelList,
    createUserChatList,
    createUserProjectList,
    createUserTeamList, updateUsersStatusFromList
} from "@/store/slice/userSlice";
import type {RootState} from "@/store/store";
import {sortChannelList} from "@/lib/utils/sortChannelList";
import {sortChatList} from "@/lib/utils/sortChatList";
import {getOtherUserId} from "@/lib/utils/getOtherUserId";
import Link from "next/link";
import {formatCount} from "@/lib/utils/helpers/formatCount";
import TouchableDiv from "@/components/animation/touchRippleAnimation";

export function MobileHome() {

    const dispatch = useDispatch();

    const [isProjectOpen, setIsProjectOpen] = useState(false);
    const [isTeamOpen, setIsTeamOpen] = useState(false);
    const [isChannelOpen, setIsChannelOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const projectNavGrp = [] as DesktopChildrenNavType[]
    const teamNavGrp = [] as DesktopChildrenNavType[]
    const channelNavGrp = [] as DesktopChildrenNavType[]
    const dmNavGrp = [] as DesktopChildrenNavType[]



    const userSideNav = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, undefined, {
        revalidateOnFocus: false,
        dedupingInterval: 30000,
    })
    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)
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
            dispatch(createUserChannelList({channelsUser: userSideNav.data?.data.user_channels}))
        }

        if(userSideNav.data?.data?.user_dms) {
            const otherUsersList = userSideNav.data.data.user_dms.reduce<UserProfileDataInterface[]>((acc, dm) => {
                const originalUser = dm.dm_chats?.[0]?.chat_to || dm.dm_chats?.[0]?.chat_from || userSideNav.data?.data || {} as UserProfileDataInterface;

                // Create a new object instead of mutating the original
                const otherUser = {
                    ...originalUser,
                    user_dms: [JSON.parse(JSON.stringify(dm))]
                };

                return [...acc, otherUser];
            }, []);


            dispatch(createUserChatList({chatUsersDm: userSideNav.data.data.user_dms}))


            dispatch(updateUsersStatusFromList({users: otherUsersList}))

        }

    }, [userSideNav.data?.data]);

    for (const p of userSidebarState.userProjects||[]) {
        // variant: path[2] && path[2]==p.project_uuid? "default" : "ghost",
        projectNavGrp.push({
            title: p.project_name,
            project_uuid: p.project_uuid,
            path: `${app_project_path}/${p.project_uuid}`,
            variant: "ghost"
        })
    }

    for (const t of userSidebarState.userTeams||[]) {
        // variant: path[2] && path[2]==p.project_uuid? "default" : "ghost",
        teamNavGrp.push({
            title: t.team_name,
            path: `${app_project_team}/${t.team_uuid}`,
            variant: "ghost"
        })
    }

    for (const c of sortChannelList(userSidebarState.userChannels||[])) {
        // variant: path[2] && path[2]==p.project_uuid? "default" : "ghost",
        channelNavGrp.push({
            title: c.ch_name,
            unread_count: c?.unread_post_count,
            path: `${app_channel_path}/${c.ch_uuid}`,
            variant: "ghost",
            isCallActive: channelCallStatus[c.ch_uuid]?.active || false,
        })
    }


    for (const d of sortChatList(userSidebarState.userChats||[])) {
        let p = ''
        const dm_participants = d.dm_participants.filter((t) => t.user_uuid != userSideNav.data?.data.user_uuid)

        if(dm_participants.length > 1) {

            p = `${app_grp_chat_path}/${d.dm_grouping_id}`
        }else {
            const u = getOtherUserId(d.dm_grouping_id, userSideNav.data?.data.user_uuid ||'')
            p = `${app_chat_path}/${u}`
        }

        dmNavGrp.push({
            title: dm_participants.length == 0 ? userSideNav.data?.data.user_name || '' : dm_participants.map((item) => item.user_name).join(","),
            userParticipants: dm_participants.length > 1 ? dm_participants : [],
            unread_count: d?.dm_unread,
            userProfile: dm_participants.length == 0 ? d.dm_participants[0] : (dm_participants.length == 1 ? dm_participants[0] : undefined),
            path: p,
            variant: "ghost",
            isCallActive: chatCallStatus[d.dm_grouping_id]?.active || false,
        })
    }

    const totalChannelUnread = useMemo(() => 
        (userSidebarState.userChannels || []).reduce((acc, channel) => acc + (channel.unread_post_count || 0), 0),
        [userSidebarState.userChannels]
    );

    const totalDMUnread = useMemo(() => 
        (userSidebarState.userChats || []).reduce((acc, chat) => acc + (chat.dm_unread || 0), 0),
        [userSidebarState.userChats]
    );

    const secondaryNavLinks1:DesktopNavType[] = [
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
    ];

    const secondaryNavLinks2:DesktopNavType[] = [

        {
            title: 'teams',
            label: "",
            icon: Users,
            variant: "ghost",
            path: "#",
            action: userSideNav.data?.data.user_is_admin ? ()=>{dispatch(openUI({ key: 'createTeam' }))} : undefined,
            isOpen: isTeamOpen,
            setIsOpen: setIsTeamOpen,
            children: teamNavGrp
        }
    ];

    const secondaryNavLinks3:DesktopNavType[] = [

        {
            title: 'channels',
            label: formatCount(totalChannelUnread),
            icon: Hash,
            variant: "ghost",
            path: "#",
            action: ()=>{dispatch(openUI({ key: 'createChannel' }))},
            isOpen: isChannelOpen,
            setIsOpen: setIsChannelOpen,
            children: channelNavGrp,
            className: totalChannelUnread > 0 ? "font-bold" : ""
        },
    ];

    const secondaryNavLinks4:DesktopNavType[] = [

        {
            title: 'chats',
            label: formatCount(totalDMUnread),
            icon: MessageCircle,
            variant: "ghost",
            path: "#",
            action: ()=>{dispatch(openUI({ key: 'createChatMessage' }))},
            isOpen: isChatOpen,
            setIsOpen: setIsChatOpen,
            children: dmNavGrp,
            className: totalDMUnread > 0 ? "font-bold" : ""
        },
    ];



    return (
        <div className='flex flex-col space-y-4 justify-center mt-6 pl-4 pr-4'>
            <MobileHomeSearchBar/>
            <div className='flex justify-between'>
                <Link href={app_post_path}>
                    <TouchableDiv className='h-[9vh] w-[29vw] bg-secondary rounded-2xl flex flex-col justify-center p-4'>
                        <div className='bg-gray-500 flex justify-center items-center mb-2 rounded-md w-6 p-1'><FileText className="h-4 w-4" stroke={'white'}/></div>
                            <span>Posts</span>

                    </TouchableDiv>
                </Link>
                <Link href={app_doc_path}>
                    <TouchableDiv className='h-[9vh] w-[29vw]  bg-secondary rounded-2xl flex flex-col justify-center p-4'>
                        <div className='bg-blue-500 flex justify-center items-center mb-2 rounded-md w-6  p-1' ><FileIcon className="h-4 w-4" stroke={'white'}/></div>
                        <span >Docs</span>
                    </TouchableDiv>
                </Link>

                <Link href={app_recording_activity}>
                    <TouchableDiv className='h-[9vh] w-[29vw] bg-secondary rounded-2xl flex flex-col justify-center p-4'>

                        <div className='bg-green-500 flex justify-center items-center mb-2 rounded-md w-6 p-1'><Video className="h-4 w-4" stroke={'white'}/></div>
                        <span>Recordings</span>

                    </TouchableDiv>
                </Link>
            </div>

            <div className='flex flex-col overflow-y-scroll h-full'>
                <DesktopSideNavigationBar isCollapsed={false} links={secondaryNavLinks1} />
                <Separator />
                <DesktopSideNavigationBar isCollapsed={false} links={secondaryNavLinks2} />
                <Separator />
                <DesktopSideNavigationBar isCollapsed={false} links={secondaryNavLinks3} />
                <Separator />
                <DesktopSideNavigationBar isCollapsed={false} links={secondaryNavLinks4} />
                <Separator />


            </div>


        </div>
    );
}