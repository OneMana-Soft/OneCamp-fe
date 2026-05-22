"use client"

import {useMedia} from "@/context/MediaQueryContext";
import {useEffect, useRef} from "react";
import {app_channel_path} from "@/types/paths";
import {usePathname, useRouter} from "next/navigation";
import {useDispatch} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";

/**
 * Layout for /app/channel/[channel-id]/[post-id].
 *
 * Mobile renders the children. Desktop normalises to
 * /app/channel/[channel-id]?postId=... with the right panel open for the
 * focused post. `replace` keeps Back from bouncing through the
 * un-normalised URL.
 */
export default function PostLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {


    const {isMobile, isDesktop} = useMedia()
    const router = useRouter();
    const dispatch = useDispatch();
    const handledRef = useRef(false)

    const channelId = usePathname().split('/')[3]
    const postId = usePathname().split('/')[4]


    useEffect(() => {


        if (isDesktop && !handledRef.current && channelId && postId) {
            handledRef.current = true
            dispatch(openRightPanel({taskUUID: "", chatMessageUUID: "", chatUUID: "", channelUUID:channelId, postUUID:postId, groupUUID: "", docUUID:""}))
            router.replace(app_channel_path + '/' + channelId + '?postId=' + postId);
        }

    }, [isDesktop, channelId, postId, dispatch, router]);

    return (
        <>
            {
                isMobile && <>{children}</>
            }
        </>
    )

}