"use client"

import {usePathname, useRouter} from "next/navigation";
import Link from "next/link";
import {useDispatch} from "react-redux";
import {OrgAvatarNav} from "@/components/navigationBar/orgAvatarNav";
import {openUI} from "@/store/slice/uiSlice";
import {ArrowLeft} from "lucide-react";
import {Button} from "@/components/ui/button";
import {app_channel_path} from "@/types/paths";

export function MobileTopNavigationBarFirst() {
    const router = useRouter();

    const path = usePathname().split('/')
    const dispatch = useDispatch();

    const renderComponent = () => {
        switch (path[2]) {
            case "myTask":
            case "project":
            case "team":
            case "create":
            case "forward":
            case "meet":
            case "search":
            case "home":
            case "profile":
            case "activity":
            case "user":

                if(path.length < 4)
                return <div onClick={()=>{dispatch(openUI({ key: 'orgProfileDrawer' }))}}><OrgAvatarNav/></div>;
                if(path.length < 6)
                    return <Button variant='ghost' size='icon' onClick={()=>{router.back()}}><ArrowLeft className='h-5' /></Button>
                break;
            case "channel":
                if(path.length < 4)
                    return <div onClick={()=>{dispatch(openUI({ key: 'orgProfileDrawer' }))}}><OrgAvatarNav/></div>;
                if(path.length < 5) {
                    return <Link href={app_channel_path}><Button variant='ghost' size='icon'><ArrowLeft className='h-5' /></Button></Link>
                }
                if(path.length < 6) {
                    return <Link href={`${app_channel_path}/${path[3]}`}><Button variant='ghost' size='icon'><ArrowLeft className='h-5' /></Button></Link>
                }
            case "chat":

                if(path.length > 3 && path[3] == 'group') {

                    if(path.length < 7)
                        return <Button variant='ghost' size='icon' onClick={()=>{router.back()}}><ArrowLeft className='h-5' /></Button>
                }

                if(path.length < 4)
                    return <div onClick={()=>{dispatch(openUI({ key: 'orgProfileDrawer' }))}}><OrgAvatarNav/></div>;
                if(path.length < 6)
                    return <Button variant='ghost' size='icon' onClick={()=>{router.back()}}><ArrowLeft className='h-5' /></Button>
                break;
            case "doc":
            case "task":
            case "calls":
            case "posts":
            case "recordings":


                return <Button variant='ghost' size='icon' onClick={()=>{router.back()}}><ArrowLeft className='h-5' /></Button>

            default:
                return <></>;
        }
    };

    return (
        <div className='flex justify-start'>
            {renderComponent()}
        </div>
    );
}