"use client"

import { displayNameOf } from "@/lib/personName"
import {usePathname, useRouter} from "next/navigation";
import {UserStatusNav} from "@/components/navigationBar/userStatusNav";
import {UserAvatarNav} from "@/components/navigationBar/userAvatarNav";
import {useDispatch, useSelector} from "react-redux";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import { Filter, Plus, SendHorizontal } from "@/lib/icons";
import type { ReactNode } from "react";
import { Ellipsis } from "@/lib/icons";
import {RootState} from "@/store/store";
import {clickedMobileFwdMsgSend} from "@/store/slice/fwdMessageSlice";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {MobileTopNavigationBarThirdDoc} from "@/components/navigationBar/mobile/mobileTopNavigationBarThirdDoc";
import {MobileBoardCreateButton} from "@/components/navigationBar/mobile/mobileBoardCreateButton";
import NudgeBell from "@/components/ai/NudgeBell";

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

    const router = useRouter();
    const openMenu = () => dispatch(openUI({ key: 'userProfileDrawer' }));

    const renderComponent = () => {
        switch (path[2]) {
            case "home":

                // Home only: it is where you start, and the bell, your status
                // and your menu are yours, not a page's. On every page that
                // listed them (search, settings, tables, templates and more)
                // they took 140px of the bar, pushed the title 48px off centre
                // and cut a section's name to "Your AI…".
                // 44px targets for a thumb, 4px apart: the bell and the status
                // button are the desktop's 36px controls, sized up here.
                return <div className='flex items-center gap-1 justify-end [&_button]:size-11'>
                    <NudgeBell />
                    <UserStatusNav userUUID={selfProfile.data?.data.user_uuid || ''}/>
                    {/* Was a bare div with onClick: no role, no name, no keyboard. */}
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Open menu"
                        onClick={openMenu}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                openMenu()
                            }
                        }}
                        className="h-11 w-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                        <UserAvatarNav userUUID={selfProfile.data?.data.user_uuid} userName={displayNameOf(selfProfile.data?.data)} userProfileObjKey={selfProfile.data?.data.user_profile_object_key}/>
                    </div>
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
                        <Button aria-label='Project options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'projectOptionsDrawer', data: { projectUUID: path[3] } }))}}><Ellipsis className='h-5'/></Button>

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
                    return <div className='flex space-x-1'>
                        <Button aria-label='Channel options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'channelOptionsDrawer', data: { channelUUID: path[3] } }))}}><Ellipsis className='h-5'/></Button>
                        </div>
                break
            case "board":
                if(path.length < 4)
                    return <MobileBoardCreateButton />
                break
            case "doc":
                if(path.length < 4)
                    return <CreateButton label='New doc' onClick={()=>{dispatch(openUI({ key: 'createDoc' }))}} />
                if(path.length < 5)
                    return <MobileTopNavigationBarThirdDoc docId={path[3]} />

            case "chat":

                
                if(path.length < 4)
                return  <CreateButton label='New chat' onClick={()=>(dispatch(openUI({ key: 'createChatMessage' })))} />

                if(path.length < 5) {

                    return (
                        <Button aria-label='Chat options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'chatOptionsDrawer', data: {chatUUID: path[3]} }))}}><Ellipsis className='h-5'/></Button>
                    )

                }

                if (path[3] == 'group') {

                    if (path.length < 6)
                        return (
                            <Button aria-label='Group chat options' variant='ghost' size='icon' className="h-11 w-11" onClick={()=>{dispatch(openUI({ key: 'groupChatOptionsDrawer', data: {grpId: path[4]} }))}}><Ellipsis className='h-5'/></Button>

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