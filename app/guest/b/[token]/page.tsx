"use client";

import { use, useCallback, useEffect, useState } from "react";
import { getGuestCollabSession } from "@/services/guestService";
import { GuestBoardViewer } from "@/components/guest/GuestBoardViewer";
import { Loader2, AlertCircle, Network, Eye } from "@/lib/icons";

type Phase = "validating" | "viewing" | "unavailable";

export default function GuestBoardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    const [phase, setPhase] = useState<Phase>("validating");
    const [documentName, setDocumentName] = useState("");
    const [boardId, setBoardId] = useState("");

    useEffect(() => {
        let alive = true;
        getGuestCollabSession(token).then((session) => {
            if (!alive) return;
            if (session && session.resource_type === "board" && session.document_name) {
                setDocumentName(session.document_name);
                setBoardId(session.resource_id);
                setPhase("viewing");
            } else {
                setPhase("unavailable");
            }
        });
        return () => {
            alive = false;
        };
    }, [token]);

    const tokenFetcher = useCallback(async (): Promise<string> => {
        const session = await getGuestCollabSession(token);
        return session?.collab_token || "";
    }, [token]);

    if (phase === "validating") {
        return (
            <Centered>
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Opening the shared board…</p>
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
                    The share link may have expired or been revoked. Ask the person who shared it for a new link.
                </p>
            </Centered>
        );
    }

    return (
        <div className="flex h-screen w-screen flex-col bg-background">
            <header className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Network className="h-3.5 w-3.5" />
                    </span>
                    Shared board
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Eye className="h-3 w-3" /> Read only
                </span>
            </header>
            <main className="relative min-h-0 flex-1">
                <GuestBoardViewer
                    documentName={documentName}
                    boardId={boardId}
                    token={token}
                    tokenFetcher={tokenFetcher}
                />
            </main>
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
