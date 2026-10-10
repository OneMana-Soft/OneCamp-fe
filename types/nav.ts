import {LucideIcon} from "lucide-react";
import React from "react";
import {UserProfileDataInterface} from "@/types/user";

export interface DesktopChildrenNavType {

    title: string
    path: string
    variant?: "default" | "ghost" | "sidebarActive"
    unread_count?:number
    project_uuid?: string
    /** What the item is (a channel's, doc's or team's uuid), for its identity
     *  hue (lib/campHue): the sidebar draws its glyph in that hue. A
     *  destination (All docs, Home) has none and stays neutral. */
    hue_id?: string
    userParticipants?: UserProfileDataInterface[]
    userProfile?: UserProfileDataInterface
    isCallActive?: boolean
    icon?: LucideIcon
    isFavorite?: boolean
}

export interface DesktopNavType {
        title: string;
        label?: string;
        icon?: LucideIcon  ;
        variant?: "default" | "ghost" | "sidebarActive";
        path?: string;
        action?:((()=>void)|undefined)
        isOpen?: boolean;
        setIsOpen?:(b:boolean)=>void
        children?:DesktopChildrenNavType[]
        className?: string;
        inlineCreator?: React.ReactNode;
}
