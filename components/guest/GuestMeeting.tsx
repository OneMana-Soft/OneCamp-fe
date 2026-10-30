"use client";

// A guest in a meeting, at the door they came by: a link's token (/guest/m) or a room's address (/r).

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LazyVideoConference as VideoConference } from "@/components/livekit/LazyCall";
import { PreJoin } from "@/components/livekit/PreJoin";
import type { GreenRoomTracks } from "@/components/livekit/greenRoomHandOver";
import { CallEndScreen } from "@/components/livekit/CallEndScreen";
import { JoinHandled, useCallLifecycle } from "@/components/livekit/useCallLifecycle";
import type { CallStateRead } from "@/components/livekit/callState";
import { joinGuestMeetingAs } from "@/services/callService";
import { doorPath, getGuestMeetingStatus, type GuestDoor } from "@/services/guestDoor";
import { GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { PublicFrame } from "@/components/guest/PublicFrame";
import { publicTrouble, sendFailedText } from "@/services/publicApi";
import { Loader2 } from "@/lib/icons";
import { rememberedMember } from "@/lib/memberMark";
import type { SessionMember } from "@/lib/auth/sessionMember";
import type { JoiningAsView, MemberWayView } from "@/components/guest/memberAtLink";

/** Joining, over the green room. */
function Joining() {
    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50" role="status" aria-label="Joining the meeting">
            <Loader2 className="h-6 w-6 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
        </div>
    );
}

// The lobby (CALLS-2), loaded with the knock.
const GuestLobby = dynamic(() => import("@/components/guest/GuestLobby").then((m) => m.GuestLobby), { ssr: false, loading: Joining });
const lobby = () => import("@/components/guest/waitToBeLetIn");

/** The meeting as its door answers it, with what it is doing (recording, transcription). */
type GuestMeetingStatus = { available?: boolean; state?: string; workspace_name?: string; title?: string } & Pick<CallStateRead, "recording" | "transcription">;

/** How often the green room asks again, so a recording that starts while the guest decides is said before Join. */
const REFRESH_MS = 10_000;

/** What a guest reads when the meeting's host has locked it: the link still works once it is unlocked. */
const GUEST_LOCKED = "This meeting is locked, so nobody new can join it. Ask the host to unlock it, then try again.";

/**
 * gone is what a dead door says; onLocked, a room's, asks for its passcode
 * (again, once it changed); memberHref is where someone in the workspace
 * comes in as themselves, in the app (calls HU13).
 */
export function GuestMeeting({ door, gone, onLocked, memberHref }: { door: GuestDoor; gone: React.ReactNode; onLocked?: () => void; memberHref?: string }) {
    // 1. Read the door before the join form, again while the server is busy or away.
    const { data, trouble } = useGuestAnswer(`meet:${doorPath(door)}`, () => getGuestMeetingStatus(door));
    const [fresh, setFresh] = useState<GuestMeetingStatus | null>(null);
    const status = (fresh ?? data) as GuestMeetingStatus | null;
    const locked = status?.state === "locked";
    useEffect(() => {
        if (locked) onLocked?.();
    }, [locked, onLocked]);
    // The name they joined as, so a rejoin doesn't ask for it again.
    const [lastName, setLastName] = useState("");
    const nameRef = useRef("");
    const [nameError, setNameError] = useState("");
    // The link turned out to be dead when joining.
    const [unavailable, setUnavailable] = useState(false);
    // Someone signed in to the workspace, at its link (calls HU13): asked only
    // where a member has used the app (lib/memberMark), by the session check
    // (lib/auth/sessionMember), both loaded then; a stranger's visit asks
    // nobody's session. "Join as a guest instead" keeps the guest's form.
    const [way, setWay] = useState<{ member: SessionMember; View: MemberWayView; Joining: JoiningAsView } | null>(null);
    const [asGuest, setAsGuest] = useState(false);
    useEffect(() => {
        if (!memberHref || !rememberedMember()) return;
        let live = true;
        void import("@/components/guest/memberAtLink")
            .then(async (m) => {
                const member = await m.activeMember();
                if (live && member) setWay({ member, View: m.MemberWay, Joining: m.JoiningAs });
            })
            // The member's way didn't load, or the session check failed: the guest's form stays, as for anyone.
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [memberHref]);
    // The lobby (CALLS-2): the knock's ticket, and the wait's stop (Leave, or leaving the page).
    const [knocking, setKnocking] = useState<string | null>(null);
    const stopWaiting = useRef<AbortController | null>(null);
    useEffect(() => () => stopWaiting.current?.abort(), []);

    const call = useCallLifecycle(
        useCallback(
            async ({ language }) => {
                setNameError("");
                const res = await joinGuestMeetingAs(door, nameRef.current, language);
                if (res.ok && res.data?.token) return res.data.token;
                // The lobby: wait for someone running the call to answer the knock.
                if (res.ok && res.data?.ticket) {
                    const stop = (stopWaiting.current = new AbortController());
                    setKnocking(res.data.ticket);
                    try {
                        const got = await (await lobby()).waitToBeLetIn(door, res.data.ticket, language, stop.signal);
                        if (typeof got === "object") return got.token;
                        if (got === "locked" && onLocked) onLocked();
                        else setUnavailable(got === "gone");
                        throw new JoinHandled();
                    } finally {
                        setKnocking(null);
                    }
                }
                if (!res.ok && res.status === 400) {
                    setNameError("Please enter your name.");
                    throw new JoinHandled();
                }
                if (!res.ok && res.status === 401 && res.code === "locked" && onLocked) {
                    onLocked();
                    throw new JoinHandled();
                }
                // Its host locked it: the link still works, once they unlock it.
                if (!res.ok && res.code === "call_locked") throw new Error(GUEST_LOCKED);
                // A busy or unreachable server is worth another try; a dead link isn't.
                if (!res.ok && publicTrouble(res.status) !== "gone") throw new Error(sendFailedText(res));
                setUnavailable(true);
                throw new JoinHandled();
            },
            [door, onLocked],
        ),
    );

    // While the guest is in the green room, the meeting is read again: a
    // recording or captions that start meanwhile are said before Join.
    const waiting = call.phase === "prejoin" || call.phase === "joining";
    useEffect(() => {
        if (!waiting || !data) return;
        const t = window.setInterval(() => {
            void getGuestMeetingStatus(door).then((res) => {
                if (res.ok) setFresh(res.data as GuestMeetingStatus);
            });
        }, REFRESH_MS);
        return () => window.clearInterval(t);
    }, [waiting, data, door]);

    if (!status || locked) {
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
                    // A guest lets nobody in: no member's read, and no admit.
                    lobby={undefined}
                    guest
                    audio={call.choice.audio}
                    video={call.choice.video}
                    tracks={call.choice.tracks}
                />
            </div>
        );
    }

    const errorMsg = nameError || call.joinError;
    const join = (v: { audioEnabled: boolean; videoEnabled: boolean; displayName?: string; tracks?: GreenRoomTracks }) => {
        nameRef.current = (v.displayName || "").trim();
        setLastName(nameRef.current);
        call.join(v);
    };
    // prejoin / joining
    return (
        <PublicFrame
            surface="guest-meeting"
            workspaceName={status?.workspace_name}
            // The header follows the choice: who joins while "Join as Kai Lin" leads, a guest once they pick that.
            title={memberHref && way && !asGuest ? <way.Joining name={way.member.name} /> : "Joining as a guest"}
            className="relative"
        >
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
                    instead={memberHref && way && !asGuest ? (choice) => (
                        <way.View member={way.member} href={memberHref} choice={choice} onGuest={() => setAsGuest(true)} />
                    ) : undefined}
                    extra={memberHref && !(way && !asGuest) ? (
                        <p className="mt-3 text-center text-ui-sm text-ink-3">
                            In this workspace? <a href={memberHref} data-touch-target="" className="font-medium text-ink underline-offset-2 hover:underline">Join as yourself</a>
                        </p>
                    ) : undefined}
                />
            </div>
            {call.phase === "joining" && knocking && (
                <GuestLobby
                    name={lastName}
                    title={status.title}
                    onLeave={() => {
                        stopWaiting.current?.abort();
                        void lobby().then((m) => m.leaveLobby(door, knocking));
                    }}
                />
            )}
            {call.phase === "joining" && !knocking && <Joining />}
        </PublicFrame>
    );
}
