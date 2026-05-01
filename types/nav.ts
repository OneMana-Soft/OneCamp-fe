import {LucideIcon} from "lucide-react";
import {UserProfileDataInterface} from "@/types/user";

export interface DesktopChildrenNavType {

    title: string
    path: string
    variant?: "default" | "ghost" | "sidebarActive"
    unread_count?:number
    project_uuid?: string
    userParticipants?: UserProfileDataInterface[]
    userProfile?: UserProfileDataInterface
    isCallActive?: boolean
}

export interface DesktopNavType {
        title: string;
        label?: string;
        icon?: LucideIcon  ;
        variant?: "default" | "ghost" | "sidebarActive";
        path?: string;
        action?:(()=>void)|undefined
        isOpen?: boolean;
        setIsOpen?:(b:boolean)=>void
        children?:DesktopChildrenNavType[]
        className?: string
}
