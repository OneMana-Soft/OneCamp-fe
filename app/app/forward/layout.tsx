"use client"

import {useMedia} from "@/context/MediaQueryContext";
import {useEffect, useRef} from "react";
import {app_home_path} from "@/types/paths";
import {useRouter} from "next/navigation";

/**
 * Layout for /app/forward/[forward-type]/[forward-id].
 *
 * Mobile only — forwarding messages on desktop happens through a dialog
 * triggered from the message itself, so a desktop user landing here means
 * they hit a stale link. Replace to /app/home so Back doesn't bounce
 * through this stub.
 */
export default function ForwardLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {


    const {isMobile, isDesktop} = useMedia()
    const router = useRouter();
    const handledRef = useRef(false)


    useEffect(() => {
        if (isDesktop && !handledRef.current) {
            handledRef.current = true
            router.replace(app_home_path);
        }
    }, [isDesktop, router]);

    return (
        <>
            {
                isMobile && <>{children}</>
            }
        </>
    )

}