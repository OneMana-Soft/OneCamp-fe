"use client";

import { use, useMemo } from "react";
import { GuestMeeting } from "@/components/guest/GuestMeeting";
import { PublicGone } from "@/components/guest/publicStates";
import { LINK_GONE } from "@/components/guest/doorGone";
import { linkDoor } from "@/services/guestDoor";

const gone = <PublicGone surface="guest-meeting" {...LINK_GONE} />;

export default function GuestMeetingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const door = useMemo(() => linkDoor(token), [token]);
    return <GuestMeeting door={door} gone={gone} memberHref={`/app/meet/join/${encodeURIComponent(token)}`} />;
}
