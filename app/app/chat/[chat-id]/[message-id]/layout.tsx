"use client"

import {useMedia} from "@/context/MediaQueryContext";
import {useEffect, useRef} from "react";
import {app_chat_path} from "@/types/paths";
import {usePathname, useRouter} from "next/navigation";
import {useDispatch} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";

/**
 * Layout for /app/chat/[chat-id]/[message-id].
 *
 * Mobile renders the children (full-page conversation focused on the
 * specific message). Desktop has no nested message route — the canonical
 * desktop URL is /app/chat/[chat-id]?messageId=... with the right panel
 * open. We replace, not push, so Back skips the un-normalised URL.
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

    const chatId = usePathname().split('/')[3]
    const chatMessageId = usePathname().split('/')[4]



    useEffect(() => {

        if (isDesktop && !handledRef.current && chatId && chatMessageId) {
            handledRef.current = true
            dispatch(openRightPanel({chatMessageUUID: chatMessageId, chatUUID: chatId, channelUUID: '', postUUID: '', taskUUID: '', groupUUID: '', docUUID:''}))
            router.replace(app_chat_path + '/' + chatId + '?messageId=' + chatMessageId);
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