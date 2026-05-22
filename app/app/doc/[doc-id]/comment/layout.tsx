"use client"

import {useMedia} from "@/context/MediaQueryContext";
import {useEffect, useRef} from "react";
import {app_doc_path} from "@/types/paths";
import {useParams, useRouter} from "next/navigation";
import {useDispatch} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";

/**
 * Layout for /app/doc/[doc-id]/comment.
 *
 * Mobile renders the children. Desktop normalises to /app/doc/[doc-id]
 * with the comments right panel open. `replace` keeps Back from bouncing
 * through the un-normalised URL.
 */
export default function DocCommentLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {

    const params = useParams();

    const {isMobile, isDesktop} = useMedia()
    const router = useRouter();
    const dispatch = useDispatch();
    const handledRef = useRef(false)

    const docId = params?.['doc-id'] as string;


    useEffect(() => {
        if (isDesktop && !handledRef.current && docId) {
            handledRef.current = true
            dispatch(openRightPanel({chatMessageUUID: '', chatUUID: '', channelUUID: '', postUUID: '', taskUUID: '', groupUUID: '', docUUID: docId}))
            router.replace(app_doc_path + '/' + docId);
        }
    }, [isDesktop, docId, router, dispatch]);

    return (
        <>
            {
                isMobile && <>{children}</>
            }
        </>
    )

}