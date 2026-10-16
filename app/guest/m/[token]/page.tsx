"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { VideoConference } from "@/components/livekit/VideoConference";
import { PreJoin } from "@/components/livekit/PreJoin";
import { CallEndScreen } from "@/components/livekit/CallEndScreen";
import { JoinHandled, useCallLifecycle } from "@/components/livekit/useCallLifecycle";
import type { CallStateRead } from "@/components/livekit/callState";
import { getGuestMeetingStatus } from "@/services/guestService";
import { joinGuestMeetingAs } from "@/services/callService";
import { GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { PublicGone } from "@/components/guest/publicStates";
import { PublicFrame } from "@/components/guest/PublicFrame";
import { publicTrouble, sendFailedText } from "@/services/publicApi";
import { Loader2 } from "@/lib/icons";

const gone = <PublicGone surface="guest-meeting" noun="meeting link" detail="The meeting may have ended, or the invite expired or was turned off. Ask the host for a new link." />;

/** The link's status, with what the meeting is doing (the contract's recording and transcription). */
type GuestMeetingStatus = { available: boolean; workspace_name?: string } & Pick<CallStateRead, "recording" | "transcription">;

/** How often the green room asks again, so a recording that starts while the guest decides is said before Join. */
const REFRESH_MS = 10_000;

export default function GuestMeetingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // 1. Validate the link before showing the join form, trying again while
    //    the server is busy or out of reach.
    const { data, trouble } = useGuestAnswer(`meet:${token}`, () => getGuestMeetingStatus(token));
    const [fresh, setFresh] = useState<GuestMeetingStatus | null>(null);
    const status = (fresh ?? data) as GuestMeetingStatus | null;
    // The name they joined as, so a rejoin doesn't ask for it again.
    const [lastName, setLastName] = useState("");
    const nameRef = useRef("");
    const [nameError, setNameError] = useState("");
    // The link turned out to be dead when joining.
    const [unavailable, setUnavailable] = useState(false);

    const call = useCallLifecycle(
        useCallback(
            async ({ language }) => {
                setNameError("");
                const res = await joinGuestMeetingAs(token, nameRef.current, language);
                if (res.ok && res.data?.token) return res.data.token;
                if (!res.ok && res.status === 400) {
                    setNameError("Please enter your name.");
                    throw new JoinHandled();
                }
                // A busy or unreachable server is worth another try; a dead link isn't.
                if (!res.ok && publicTrouble(res.status) !== "gone") throw new Error(sendFailedText(res));
                setUnavailable(true);
                throw new JoinHandled();
            },
            [token],
        ),
    );

    // While the guest is in the green room, the meeting is read again: a
    // recording or captions that start meanwhile are said before Join.
    const waiting = call.phase === "prejoin" || call.phase === "joining";
    useEffect(() => {
        if (!waiting || !data) return;
        const t = window.setInterval(() => {
            void getGuestMeetingStatus(token).then((res) => {
                if (res.ok) setFresh(res.data as GuestMeetingStatus);
            });
        }, REFRESH_MS);
        return () => window.clearInterval(t);
    }, [waiting, data, token]);

    if (!status) {
        return (
            <GuestNotYet trouble={trouble} gone={gone} shape="call" label="Checking your invite…" />
        );
    }

    if (unavailable) return gone;

    // Removed (CALL-BUG-11), never connected (CALL-BUG-23), or left: said on
    // the guest's own frame.
    if (call.phase === "left" || call.phase === "removed" || call.phase === "failed") {
        return <CallEndScreen call={call} guest noun="meeting" />;
    }

    if (call.phase === "in-call" && call.token) {
        return (
            <div className="h-dvh w-full">
                <VideoConference
                    token={call.token}
                    serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
                    onDisconnect={call.onDisconnect}
                    onConnected={call.onConnected}
                    isAdmin={false}
                    guest
                    audio={call.choice.audio}
                    video={call.choice.video}
                />
            </div>
        );
    }

    const errorMsg = nameError || call.joinError;
    const join = (v: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => {
        nameRef.current = (v.displayName || "").trim();
        setLastName(nameRef.current);
        call.join(v);
    };
    // prejoin / joining
    return (
        <PublicFrame surface="guest-meeting" workspaceName={status?.workspace_name} title="Joining as a guest" className="relative">
            {/* The frame's full width, never shrunk to fit: the green room is
                a size container (its layout follows its own width), so it
                gives its parent no width of its own, and a shrink-to-fit
                parent of 448px max collapsed it to its 32px of padding. The
                whole join form was a white strip a guest couldn't use. */}
            <div data-guest-meeting="" className="flex w-full flex-1 flex-col [&>[data-prejoin]]:flex-1">
                {errorMsg && (
                    <p className="mx-auto mt-4 max-w-md px-4 text-sm text-danger-ink" role="alert">{errorMsg}</p>
                )}
                {/* Told before joining (CALL-BUG-12): a recording, and
                    captions with where speech goes. */}
                <PreJoin onJoin={join} username={lastName} nameEditable joining={call.phase === "joining"} embedded
                    recording={!!status.recording?.on}
                    recordingBy={status.recording?.on ? status.recording.by || null : null}
                    transcription={status.transcription}
                />
            </div>
            {call.phase === "joining" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50" role="status" aria-label="Joining the meeting">
                    <Loader2 className="h-6 w-6 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
                </div>
            )}
        </PublicFrame>
    );
}
