"use client";

import { use, useEffect, useState } from "react";
import { VideoConference } from "@/components/livekit/VideoConference";
import { PreJoin } from "@/components/livekit/PreJoin";
import { getGuestMeetingStatus, joinGuestMeeting } from "@/services/guestService";
import { Loader2, Video, AlertCircle } from "@/lib/icons";

type Phase = "validating" | "prejoin" | "joining" | "in-call" | "ended" | "unavailable";

export default function GuestMeetingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    const [phase, setPhase] = useState<Phase>("validating");
    const [liveToken, setLiveToken] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    // 1. Validate the link before showing the join form.
    useEffect(() => {
        let alive = true;
        getGuestMeetingStatus(token).then((status) => {
            if (!alive) return;
            setPhase(status === "available" ? "prejoin" : "unavailable");
        });
        return () => {
            alive = false;
        };
    }, [token]);

    const handleJoin = async (values: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => {
        setErrorMsg("");
        setPhase("joining");
        const res = await joinGuestMeeting(
            token,
            (values.displayName || "").trim(),
            values.audioEnabled,
            values.videoEnabled,
        );
        if (res.ok && res.token) {
            setLiveToken(res.token);
            setPhase("in-call");
            return;
        }
        if (res.error === "name") {
            setErrorMsg("Please enter your name.");
            setPhase("prejoin");
            return;
        }
        setPhase("unavailable");
    };

    const handleDisconnect = () => setPhase("ended");

    if (phase === "validating") {
        return (
            <Centered>
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Checking your invite…</p>
            </Centered>
        );
    }

    if (phase === "unavailable") {
        return (
            <Centered>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <AlertCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-base font-semibold text-foreground">This link is no longer available</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                    The meeting may have ended, or the invite has expired or been revoked. Ask the host for a new link.
                </p>
            </Centered>
        );
    }

    if (phase === "ended") {
        return (
            <Centered>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Video className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-base font-semibold text-foreground">You left the meeting</p>
                <p className="text-sm text-muted-foreground">You can close this tab.</p>
            </Centered>
        );
    }

    if (phase === "in-call" && liveToken) {
        return (
            <div className="h-screen w-screen">
                <VideoConference
                    token={liveToken}
                    serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
                    onDisconnect={handleDisconnect}
                    toggleRecording={() => { /* guests cannot record */ }}
                    isAdmin={false}
                    guest
                />
            </div>
        );
    }

    // prejoin / joining
    return (
        <div className="relative min-h-screen w-full bg-background">
            <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-6">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Video className="h-4 w-4" />
                    Joining as a guest
                </div>
                {errorMsg && (
                    <p className="mb-2 text-sm text-destructive" role="alert">{errorMsg}</p>
                )}
                <PreJoin onJoin={handleJoin} username="" nameEditable joinLabel={phase === "joining" ? "Joining…" : "Join Meeting"} />
            </div>
            {phase === "joining" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            )}
        </div>
    );
}

function Centered({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">
            {children}
        </div>
    );
}
