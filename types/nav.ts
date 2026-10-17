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
    /** A channel draws its ChannelTile and a doc its DocIcon, in their hues (D13). */
    kind?: "channel" | "doc"
    /** A doc's icon, where its row's source has it (a starred place). */
    doc_icon?: string
    userParticipants?: UserProfileDataInterface[]
    userProfile?: UserProfileDataInterface
    isCallActive?: boolean
    icon?: LucideIcon
    isFavorite?: boolean
    /** A private channel draws a lock, not the #. */
    isPrivate?: boolean
    /** Muted: the label in ink-3, a bell-off at the right, never bold. */
    muted?: boolean
    /** A DM: its unread shows as its count on the brand badge (lib/nav/sidebarSignal). */
    badge?: boolean
    /** A channel's unread mentions of you: "@2" on the brand badge (lib/nav/sidebarSignal). */
    mentions?: number
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
