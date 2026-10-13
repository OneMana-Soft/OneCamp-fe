"use client";

import { displayNameOf } from "@/lib/personName"
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PreJoin } from "@/components/livekit/PreJoin";
import { joinLanguage } from "@/components/livekit/callState";
import { handOffMeeting, meetingPagePath, rememberGuestLink } from "@/components/livekit/instantMeeting";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { guestMeetingLink } from "@/services/guestService";
import { createInstantMeetingAs, meetingIdOf } from "@/services/callService";
import { apiErrorMessage } from "@/lib/utils/apiError";
import { Loader2 } from "@/lib/icons";

/**
 * Starting an instant meeting (⌘K › Start a meeting). Once the server has
 * made it, the meeting moves to its own page, /app/meet/m/<id>, which its
 * creator can come back to (CALL-BUG-17): the host's token and the guest link
 * used to live only in this page's state, and leaving or reloading lost both.
 */
export default function InstantMeetingPage() {
    const router = useRouter();
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | undefined>();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const handlePreJoin = async (values: { audioEnabled: boolean; videoEnabled: boolean }) => {
        setStarting(true);
        setStartError(undefined);
        try {
            const res = await createInstantMeetingAs(joinLanguage());
            const id = meetingIdOf(res);
            handOffMeeting(id, { hostToken: res.host_token, audio: values.audioEnabled, video: values.videoEnabled });
            rememberGuestLink(id, guestMeetingLink(res.guest_token));
            router.replace(meetingPagePath(id));
        } catch (e) {
            // Said under the button, with the server's reason: guest access
            // switched off is the usual one.
            setStartError(apiErrorMessage(e, "Guest access may be off for this workspace. Ask an admin to turn it on."));
            setStarting(false);
        }
    };

    const handleCancel = () => {
        if (window.history.length > 1) router.back();
        else router.push("/app/home");
    };

    return (
        <div className="relative">
            <PreJoin
                onJoin={handlePreJoin}
                username={displayNameOf(selfProfile.data?.data) || ""}
                hueId={selfProfile.data?.data.user_uuid}
                joinLabel="Start meeting"
                joining={starting}
                joinError={startError}
                // A new meeting: nobody is in it yet.
                inCall={[]}
                onCancel={handleCancel}
            />
            {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="h-6 w-6 text-muted-foreground motion-safe:animate-spin" />
                </div>
            )}
        </div>
    );
}
