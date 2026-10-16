"use client"

import { ChatFace } from "@/components/message/chatFace"

interface UserAvatarNavProp {
    userProfileObjKey?: string
    userName?: string
    /** Who it is, so an agent is drawn as an agent (its square with the spark) and a bot as a bot. */
    userUUID?: string
    isBot?: boolean
    size?: number
}

/**
 * A face in a list of conversations or people (the DM list, a picker): the
 * one drawing every chat surface uses (ChatFace). It drew every principal as
 * a person, so the OneCamp AI agent, a square with the spark in the sidebar
 * and in its own messages, was an "OA" disc in the DM list.
 */
export function ChatUserListUserAvatar({ userProfileObjKey, userName, userUUID, isBot = false, size = 32 }: UserAvatarNavProp) {
    return <ChatFace name={userName || ""} profileKey={userProfileObjKey} userUUID={userUUID} isBot={isBot} size={size} className="hover:cursor-pointer" />
}
