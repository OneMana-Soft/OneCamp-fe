"use client"

import { PhoneHuddleButton, WhileConversationThere } from "@/components/navigationBar/mobile/phoneConversationTitle";
import {usePathname} from "next/navigation";
import {useDispatch, useSelector} from "react-redux";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import { Filter, Plus, Search, SendHorizontal } from "@/lib/icons";
import type { ReactNode } from "react";
import { Ellipsis } from "@/lib/icons";
import {RootState} from "@/store/store";
import {clickedMobileFwdMsgSend} from "@/store/slice/fwdMessageSlice";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {MobileTopNavigationBarThirdDoc} from "@/components/navigationBar/mobile/mobileTopNavigationBarThirdDoc";
import {MobileBoardCreateButton} from "@/components/navigationBar/mobile/mobileBoardCreateButton";
import { openPalette } from "@/lib/ui/palette";
import { PhoneSelfAvatar } from "@/components/navigationBar/mobile/phoneSelfAvatar";
import { usePauseNotifications } from "@/hooks/usePauseNotifications";

/**
 * The one way a list says "make another": a 44px "+" named for what it makes.
 * Channels, projects and teams said "New" in the accent, DMs and docs drew a
 * "+", so the bar's right end changed shape from tab to tab.
 */
function CreateButton({ label, onClick, children }: { label: string; onClick: () => void; children?: ReactNode }) {
    return (
        <Button aria-label={label} variant='ghost' size='icon' className="h-11 w-11" onClick={onClick}>
            {children ?? <Plus className='h-5'/>}
        </Button>
    )
}

export function MobileTopNavigationBarThird() {


    const path = usePathname().split('/')
    const dispatch = useDispatch();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const fwdMsgSendClicked = useSelector((state: RootState) => state.fwdMsg.fwdMsgInputInputState.mobileViewSendClicked);

    const { pausedUntil, focusUntil } = usePauseNotifications();
    const openMenu = () => dispatch(openUI({ key: 'userProfileDrawer' }));

    const renderComponent = () => {
        switch (path[2]) {
            case "home":

                // Home only: it is where you start, and search and your menu
                // are yours, not a page's (design v3, Ph1). The bell is gone:
                // notifications and nudges are the Inbox tab below (N1), and
                // your status is on your avatar and in the More sheet's You
                // row. 44px targets for a thumb.
                return <div className='flex items-center gap-0.5 justify-end'>
                    <button
                        type="button"
                        aria-label="Search or ask"
                        onClick={() => openPalette()}
                        className="h-11 w-11 flex items-center justify-center rounded-md text-ink-2 active:bg-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                        <Search className="size-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label="Your profile"
                        onClick={openMenu}
                        className="h-11 w-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                        <PhoneSelfAvatar
                            profile={selfProfile.data?.data}
                            focus={!!focusUntil}
                            paused={!!pausedUntil && !focusUntil}
                        />
                    </button>
                </div>;


            case "team":

                // The list: making a team is an admin's; nobody else has a
                // control here. It fell through to one team's options, for no
                // team.
                if(path.length < 4)
                    return selfProfile.data?.data.user_is_admin
                        ? <CreateButton label='New team' onClick={()=>{dispatch(openUI({ key: 'createTeam' }))}} />
                        : null
                if(path.length < 5)
                    return <div className='flex space-x-1'>
                        <Button aria-label='Team options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'teamOptionDrawer', data: {teamId: path[3]} }))}}><Ellipsis className='h-5'/></Button>

                    </div>
                break

            case "project":

                // The list, as teams: it showed one project's filter and
                // options, for no project, to everyone but an admin.
                if(path.length < 4)
                    return selfProfile.data?.data.user_is_admin
                        ? <CreateButton label='New project' onClick={()=>{dispatch(openUI({ key: 'createProject' }))}} />
                        : null
                if(path.length < 5)
                    return <div className='flex space-x-1'>
                        <Button aria-label='Filter tasks' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'projectTaskFilterDrawer', data: { projectUUID: path[3] } }))}}><Filter className='h-5'/></Button>
                        {/* No "⋯" here: the project header line's menu is the one,
                            holding the tools, notifications, name and members. */}

                    </div>
                break

            case "calendar":
                return <div className='flex space-x-1'>
                    <Button aria-label='Calendar options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'calendarOptionsDrawer' }))}}><Ellipsis className='h-5'/></Button>
                </div>

            case "myTask":

                if(path.length < 4)
                    return <div className='flex space-x-1'>
                        <Button aria-label='Filter tasks' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'taskFilterDrawer' }))}}><Filter className='h-5'/></Button>
                        <Button aria-label='Task list options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'myTaskOptionsDrawer' }))}}><Ellipsis className='h-5'/></Button>
                    </div>

                break
            case "task":
                return <Button aria-label='Task options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'taskOptionDrawer', data: { taskId: path[3] } }))}}><Ellipsis className='h-5'/></Button>
            break

            case "channel":

                if(path.length < 4)
                    return <CreateButton label='New channel' onClick={()=>{dispatch(openUI({ key: 'createChannel' }))}} />
                if(path.length < 5)
                    return <WhileConversationThere kind="channel" id={path[3]}><div className='flex items-center'>
                        <PhoneHuddleButton kind="channel" id={path[3]} />
                        <Button aria-label='Channel options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'channelOptionsDrawer', data: { channelUUID: path[3] } }))}}><Ellipsis className='h-5'/></Button>
                        </div></WhileConversationThere>
                break
            case "board":
                if(path.length < 4)
                    return <MobileBoardCreateButton />
                break
            case "doc":
                if(path.length < 4)
                    return <CreateButton label='New doc' onClick={()=>{dispatch(openUI({ key: 'createDoc' }))}} />
                // The docs' trash has no doc to act on.
                if(path[3] === "trash")
                    return null
                if(path.length < 5)
                    return <MobileTopNavigationBarThirdDoc docId={path[3]} />

            case "chat":

                
                if(path.length < 4)
                return  <CreateButton label='New chat' onClick={()=>(dispatch(openUI({ key: 'createChatMessage' })))} />

                if(path.length < 5) {

                    return (
                        <WhileConversationThere kind="dm" id={path[3]}>
                        <div className='flex items-center'>
                            <PhoneHuddleButton kind="dm" id={path[3]} />
                            <Button aria-label='Chat options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'chatOptionsDrawer', data: {chatUUID: path[3]} }))}}><Ellipsis className='h-5'/></Button>
                        </div>
                        </WhileConversationThere>
                    )

                }

                if (path[3] == 'group') {

                    if (path.length < 6)
                        return (
                            <WhileConversationThere kind="group" id={path[4]}>
                            <Button aria-label='Group chat options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'groupChatOptionsDrawer', data: {grpId: path[4]} }))}}><Ellipsis className='h-5'/></Button>
                            </WhileConversationThere>
                        )

                }

                break;

            case "forward":

                return  <Button aria-label='Send' disabled={fwdMsgSendClicked} size='icon' className="h-11 w-11" variant='ghost' onClick={()=>(dispatch(clickedMobileFwdMsgSend()))}><SendHorizontal  className='h-5'/></Button>


            default:
                return <></>;
        }
    };

    return (
        <div className='flex justify-end items-center'>
            {renderComponent()}
        </div>
    );
}