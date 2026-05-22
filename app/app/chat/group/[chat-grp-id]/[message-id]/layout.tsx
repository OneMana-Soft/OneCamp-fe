"use client"

import {useMedia} from "@/context/MediaQueryContext";
import {useEffect, useRef} from "react";
import {app_grp_chat_path} from "@/types/paths";
import {useParams, useRouter} from "next/navigation";
import {useDispatch} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";

/**
 * Layout for /app/chat/group/[chat-grp-id]/[message-id].
 *
 * Mobile renders the children. Desktop normalises to
 * /app/chat/group/[chat-grp-id]?messageId=... with the right panel open
 * for the focused message. `replace` keeps Back from bouncing through
 * the un-normalised URL.
 */
export default function ChatLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {


    const {isMobile, isDesktop} = useMedia()
    const router = useRouter();
    const dispatch = useDispatch();
    const handledRef = useRef(false)

    const params = useParams()

    const chatId = params?.["chat-grp-id"] as string
    const chatMessageId = params?.["message-id"] as string

    useEffect(() => {

        if (isDesktop && !handledRef.current && chatId && chatMessageId) {
            handledRef.current = true
            dispatch(openRightPanel({chatMessageUUID: chatMessageId, chatUUID: "", channelUUID: '', postUUID: '', taskUUID: '', groupUUID: chatId, docUUID:''}))
            router.replace(app_grp_chat_path + '/' + chatId + '?messageId=' + chatMessageId);
        }

    }, [isDesktop, chatId, chatMessageId, dispatch, router]);


    return (
        <>
            {
                isMobile && <>{children}</>
            }
        </>
    )

}