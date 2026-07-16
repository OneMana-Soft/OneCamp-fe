"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VideoConference } from "@/components/livekit/VideoConference";
import { PreJoin } from "@/components/livekit/PreJoin";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { createInstantMeeting, guestMeetingLink } from "@/services/guestService";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2, Link as LinkIcon } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast";

export default function InstantMeetingPage() {
    const router = useRouter();
    const { toast } = useToast();

    const [token, setToken] = useState("");
    const [guestLink, setGuestLink] = useState("");
    const [starting, setStarting] = useState(false);
    const [copied, setCopied] = useState(false);

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const handlePreJoin = async (values: { audioEnabled: boolean; videoEnabled: boolean }) => {
        setStarting(true);
        try {
            const res = await createInstantMeeting(values.audioEnabled, values.videoEnabled);
            setToken(res.host_token);
            setGuestLink(guestMeetingLink(res.guest_token));
        } catch {
            toast({
                title: "Couldn't start the meeting",
                description: "Guest access may be disabled. Ask an admin to enable it.",
                variant: "destructive",
            });
            router.back();
        } finally {
            setStarting(false);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(guestLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({ title: "Copy failed", description: "Copy the link manually.", variant: "destructive" });
        }
    };

    const handleDisconnect = () => {
        if (window.history.length > 1) router.back();
        else router.push("/app/home");
    };

    if (!token) {
        return (
            <div className="relative">
                <PreJoin
                    onJoin={handlePreJoin}
                    username={selfProfile.data?.data.user_name || ""}
                    joinLabel={starting ? "Starting…" : "Start meeting"}
                />
                {starting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative h-full w-full">
            {/* Guest invite bar — copy the shareable link. */}
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 px-3">
                <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 shadow-md backdrop-blur">
                    <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="hidden sm:inline text-xs text-muted-foreground">Invite a guest</span>
                    <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={copyLink}>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied" : "Copy link"}
                    </Button>
                </div>
            </div>

            <VideoConference
                token={token}
                serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
                onDisconnect={handleDisconnect}
                toggleRecording={() => { /* host instant meeting: recording disabled in v1 */ }}
                isAdmin={true}
            />
        </div>
    );
}
