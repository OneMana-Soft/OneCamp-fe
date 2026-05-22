"use client"

import { useEffect, useRef, ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { useMedia } from "@/context/MediaQueryContext";
import { openUI } from "@/store/slice/uiSlice";
import { app_home_path } from "@/types/paths";

/**
 * Layout for the /app/user/[user-id] route.
 *
 * Mobile renders a dedicated profile page (children).
 * Desktop never has a standalone profile page — clicking a user always
 * opens the OtherUserProfile dialog in place. If a desktop user lands
 * here directly (deep link, refresh, mention link in a non-OneCamp tab),
 * we replace the URL with /app/home and dispatch the dialog so they
 * see the profile in the standard desktop affordance.
 *
 * `router.replace` (not push) keeps Back from bouncing through the empty
 * stub. The `handledRef` guards against StrictMode double-invocation
 * re-opening the dialog.
 */
export default function MobileOtherUserProfileLayout({
    children
}: Readonly<{
    children: ReactNode
}>) {
    const params = useParams();
    const userUUID = params["user-id"] as string;
    const { isDesktop } = useMedia();
    const router = useRouter();
    const dispatch = useDispatch();
    const handledRef = useRef(false);

    useEffect(() => {
        if (isDesktop && !handledRef.current && userUUID) {
            handledRef.current = true;
            dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }));
            router.replace(app_home_path);
        }
    }, [isDesktop, router, dispatch, userUUID]);

    // Don't flash the mobile profile on desktop while the redirect is in flight.
    if (isDesktop === undefined || isDesktop) return null;

    return <>{children}</>;
}
