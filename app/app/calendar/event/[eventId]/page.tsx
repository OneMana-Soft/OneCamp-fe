"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useMedia } from "@/context/MediaQueryContext";
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { app_calendar_path } from "@/types/paths";
import EventInfoPanel from "@/components/rightPanel/eventInfoPanel";

/**
 * /app/calendar/event/[eventId]
 *
 * Mobile renders the EventInfoPanel as a full-page surface.
 * Desktop has no standalone event page — events open in the right panel
 * over /app/calendar. If a desktop user lands here directly (deep link,
 * refresh) we open the right panel for the event and replace the URL
 * with /app/calendar so Back doesn't bounce through an empty stub.
 *
 * `handledRef` guards against StrictMode double-invocation re-firing
 * the redirect.
 */
export default function MobileEventPage() {
    const params = useParams();
    const router = useRouter();
    const dispatch = useDispatch();
    const { isMobile, isDesktop } = useMedia();
    const eventId = params.eventId as string;
    const handledRef = useRef(false);

    useEffect(() => {
        if (isDesktop && !handledRef.current && eventId) {
            handledRef.current = true;
            dispatch(openRightPanel({ eventUUID: eventId }));
            router.replace(app_calendar_path);
        }
    }, [isDesktop, eventId, dispatch, router]);

    if (!eventId) return null;

    const handleClose = () => {
        router.push(app_calendar_path);
    };

    if (!isMobile) return null;

    return (
        <div className="flex flex-col h-full bg-background">
            <main className="flex-1 overflow-y-auto">
                <EventInfoPanel eventUUID={eventId} onClose={handleClose} />
            </main>
        </div>
    );
}
