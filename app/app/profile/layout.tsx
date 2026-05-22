"use client"

import { useEffect, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { useMedia } from "@/context/MediaQueryContext";
import { openUI } from "@/store/slice/uiSlice";
import { app_home_path } from "@/types/paths";

/**
 * Layout for the /app/profile route.
 *
 * Mobile renders the dedicated self-profile page (children).
 * Desktop never has a standalone self-profile page — the profile dialog
 * is opened in place from the avatar in the top nav. If a desktop user
 * lands here directly (deep link, refresh) we replace the URL with
 * /app/home and open the dialog in place.
 *
 * `router.replace` (not push) keeps Back from bouncing through the empty
 * stub. The `handledRef` guards against StrictMode double-invocation
 * re-opening the dialog.
 */
export default function MobileSelfProfileLayout({ children }: { children: ReactNode }) {
    const { isDesktop } = useMedia();
    const router = useRouter();
    const dispatch = useDispatch();
    const handledRef = useRef(false);

    useEffect(() => {
        if (isDesktop && !handledRef.current) {
            handledRef.current = true;
            dispatch(openUI({ key: "selfUserProfile" }));
            router.replace(app_home_path);
        }
    }, [isDesktop, router, dispatch]);

    // Don't flash the mobile profile on desktop while the redirect is in flight.
    if (isDesktop === undefined || isDesktop) return null;

    return <>{children}</>;
}
