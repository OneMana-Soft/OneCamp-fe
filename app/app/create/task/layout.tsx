"use client"

import { useMedia } from "@/context/MediaQueryContext";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { app_my_task_path } from "@/types/paths";
import { taskAddressQuery } from "@/lib/task/taskAddressParams";

/**
 * Layout for the /app/create/task route.
 *
 * Mobile gets the dedicated full-page create form (children).
 * Desktop should never see the page surface — the canonical desktop
 * affordance is the CreateTask dialog opened in place from wherever
 * the user is. If a desktop user lands here directly (deep link, refresh,
 * or stale tab) we `router.replace(...)` to /app/myTask with ?open=createTask,
 * and the shell's one query reader (hooks/useOpenFromUrl) opens the dialog
 * with whatever fields the link named (?title=…&project=Q4). Replace, not
 * push, so Back doesn't bounce the user through this empty stub.
 */
export default function CreateTaskLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const { isMobile, isDesktop } = useMedia()
    const router = useRouter()
    const handledRef = useRef(false)

    useEffect(() => {
        // Guard against StrictMode double-invocation in dev and against
        // the effect re-firing if isDesktop briefly flickers during
        // first paint — we only want one redirect + dialog open.
        if (isDesktop && !handledRef.current) {
            handledRef.current = true
            const fields = taskAddressQuery(new URLSearchParams(window.location.search))
            router.replace(`${app_my_task_path}?open=createTask${fields ? `&${fields}` : ""}`)
        }
    }, [isDesktop, router]);

    return (
        <>
            {isMobile && <>{children}</>}
        </>
    )
}
