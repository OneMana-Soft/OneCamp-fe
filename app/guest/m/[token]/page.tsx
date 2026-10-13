"use client";

import { use, useState } from "react";
import { VideoConference, type CallEnd } from "@/components/livekit/VideoConference";
import { PreJoin } from "@/components/livekit/PreJoin";
import { joinLanguage, removedText, type CallRemoval, type CallStateRead } from "@/components/livekit/callState";
import { getGuestMeetingStatus } from "@/services/guestService";
import { joinGuestMeetingAs } from "@/services/callService";
import { GuestCentered as Centered, GuestLinkGone, GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { PublicFrame } from "@/components/guest/PublicFrame";
import { publicTrouble, sendFailedText } from "@/services/publicApi";
import { Loader2, UserMinus, Video } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Tile } from "@/components/ui/graphics/Tile";

type Phase = "prejoin" | "joining" | "in-call" | "ended" | "removed" | "unavailable";

const gone = <GuestLinkGone detail="The meeting may have ended, or the invite has expired or been revoked. Ask the host for a new link." />;

/** The link's status, with what the meeting is doing (the contract's recording and transcription). */
type GuestMeetingStatus = { available: boolean; workspace_name?: string } & Pick<CallStateRead, "recording" | "transcription">;

export default function GuestMeetingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // 1. Validate the link before showing the join form, trying again while
    //    the server is busy or out of reach.
    const { data, trouble } = useGuestAnswer(`meet:${token}`, () => getGuestMeetingStatus(token));
    const status = data as GuestMeetingStatus | null;
    const [phase, setPhase] = useState<Phase>("prejoin");
    const [liveToken, setLiveToken] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    // The name they joined as, so a rejoin doesn't ask for it again.
    const [lastName, setLastName] = useState("");
    // The green room's choice, carried into the call (CALL-BUG-1).
    const [choice, setChoice] = useState({ audio: true, video: true });
    // Why the host took them out (CALL-BUG-11).
    const [removal, setRemoval] = useState<CallRemoval | null>(null);

    const handleJoin = async (values: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string }) => {
        setErrorMsg("");
        setPhase("joining");
        const displayName = (values.displayName || "").trim();
        setLastName(displayName);
        setChoice({ audio: values.audioEnabled, video: values.videoEnabled });
        const res = await joinGuestMeetingAs(token, displayName, joinLanguage());
        if (res.ok && res.data?.token) {
            setLiveToken(res.data.token);
            setPhase("in-call");
            return;
        }
        if (!res.ok && res.status === 400) {
            setErrorMsg("Please enter your name.");
            setPhase("prejoin");
            return;
        }
        // A busy or unreachable server is worth another try; a dead link isn't.
        if (!res.ok && publicTrouble(res.status) !== "gone") {
            setErrorMsg(sendFailedText(res));
            setPhase("prejoin");
            return;
        }
        setPhase("unavailable");
    };

    const handleDisconnect = (end?: CallEnd) => {
        if (end?.removed) {
            setRemoval(end.removed);
            setPhase("removed");
            return;
        }
        setPhase("ended");
    };

    if (!status) {
        return (
            <GuestNotYet trouble={trouble} gone={gone} shape="call" label="Checking your invite…" />
        );
    }

    if (phase === "unavailable") return gone;

    // Removed by the host, or their link turned off (CALL-BUG-11): why, and no
    // Join again, which would only walk them back into a meeting they were
    // taken out of.
    if (phase === "removed") {
        const { title, detail } = removedText(removal, true);
        return (
            <Centered>
                <Tile hue="berry" size="lg"><UserMinus /></Tile>
                <h1 className="text-base font-semibold text-foreground">{title}</h1>
                <p className="text-sm text-muted-foreground" role="status">{detail} You can close this tab.</p>
            </Centered>
        );
    }

    // Any disconnect lands here, a dropped connection included, and the link
    // still works. Leaving by mistake was a dead end ("You can close this
    // tab"); the way back in is one press, as the same name. (The error line
    // is always empty by now: a join that reached the call cleared it.)
    if (phase === "ended") {
        return (
            <Centered>
                <Tile hue="sky" size="lg"><Video /></Tile>
                <h1 className="text-base font-semibold text-foreground">You left the meeting</h1>
                <p className="text-sm text-muted-foreground">If you dropped out by mistake, join again under the same name. Otherwise you can close this tab.</p>
                <Button onClick={() => setPhase("prejoin")}>
                    Join again
                </Button>
            </Centered>
        );
    }

    if (phase === "in-call" && liveToken) {
        return (
            <div className="h-dvh w-full">
                <VideoConference
                    token={liveToken}
                    serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
                    onDisconnect={handleDisconnect}
                    isAdmin={false}
                    guest
                    audio={choice.audio}
                    video={choice.video}
                />
            </div>
        );
    }

    // prejoin / joining
    return (
        <PublicFrame surface="guest-meeting" title="Joining as a guest" className="relative">
            <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-6">
                {errorMsg && (
                    <p className="mb-2 text-sm text-danger-ink" role="alert">{errorMsg}</p>
                )}
                {/* Told before joining (CALL-BUG-12): a recording, and
                    captions with where speech goes. */}
                <PreJoin onJoin={handleJoin} username={lastName} nameEditable joining={phase === "joining"}
                    recording={!!status.recording?.on}
                    recordingBy={status.recording?.on ? status.recording.by || null : null}
                    transcription={status.transcription}
                />
            </div>
            {phase === "joining" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50" role="status" aria-label="Joining the meeting">
                    <Loader2 className="h-6 w-6 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
                </div>
            )}
        </PublicFrame>
    );
}
