"use client"

import { useMedia } from "@/context/MediaQueryContext";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { useRouter } from "next/navigation";
import { app_my_task_path } from "@/types/paths";

/**
 * Layout for the /app/create/task route.
 *
 * Mobile gets the dedicated full-page create form (children).
 * Desktop should never see the page surface — the canonical desktop
 * affordance is the CreateTask dialog opened in place from wherever
 * the user is. If a desktop user lands here directly (deep link, refresh,
 * or stale tab) we open the dialog and `router.replace(...)` to /app/myTask
 * so the history entry isn't a no-op page that flashes briefly between
 * pushes. We use replace, not push, so Back doesn't bounce the user
 * through this empty stub.
 */
export default function CreateTaskLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const { isMobile, isDesktop } = useMedia()
    const dispatch = useDispatch();
    const router = useRouter()
    const handledRef = useRef(false)

    useEffect(() => {
        // Guard against StrictMode double-invocation in dev and against
        // the effect re-firing if isDesktop briefly flickers during
        // first paint — we only want one redirect + dialog open.
        if (isDesktop && !handledRef.current) {
            handledRef.current = true
            dispatch(openUI({ key: 'createTask' }))
            router.replace(app_my_task_path)
        }
    }, [isDesktop, dispatch, router]);

    return (
        <>
            {isMobile && <>{children}</>}
        </>
    )
}
