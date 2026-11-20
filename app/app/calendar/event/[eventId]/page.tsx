"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useMedia } from "@/context/MediaQueryContext";
import { opensEditing } from "@/lib/calendar/editParam";
import { useCalendarLive } from "@/lib/calendar/liveEvent";
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
 * ?edit=1 (calendarRoute's edit: the card's pencil, Edit event) opens the
 * event editing, on the page or in the panel.
 *
 * `handledRef` guards against StrictMode double-invocation re-firing
 * the redirect.
 *
 * It reads the event again when the calendar's live message says it changed
 * (V-544), as the calendar does: a change made elsewhere shows on the page
 * without a reload. Over the calendar, on a computer, the calendar's own
 * listener does it for the panel.
 */
export default function MobileEventPage() {
    const params = useParams();
    const router = useRouter();
    const dispatch = useDispatch();
    const { isMobile, isDesktop } = useMedia();
    const eventId = params.eventId as string;
    const editing = opensEditing(useSearchParams());
    const handledRef = useRef(false);
    useCalendarLive();

    useEffect(() => {
        if (isDesktop && !handledRef.current && eventId) {
            handledRef.current = true;
            dispatch(openRightPanel({ eventUUID: eventId, ...(editing ? { eventEditAt: Date.now() } : {}) }));
            router.replace(app_calendar_path);
        }
    }, [isDesktop, eventId, editing, dispatch, router]);

    if (!eventId) return null;

    const handleClose = () => {
        router.push(app_calendar_path);
    };

    if (!isMobile) return null;

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex-1 overflow-y-auto">
                <EventInfoPanel eventUUID={eventId} onClose={handleClose} editRequest={editing ? 1 : undefined} />
            </div>
        </div>
    );
}
