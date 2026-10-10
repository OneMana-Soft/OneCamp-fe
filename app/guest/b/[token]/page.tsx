"use client";

import { use, useCallback } from "react";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestBoardViewer } from "@/components/guest/GuestBoardViewer";
import { GuestLinkGone, GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { Network, Eye } from "@/lib/icons";
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

const gone = <GuestLinkGone detail="The share link may have expired or been revoked. Ask the person who shared it for a new link." />;

export default function GuestBoardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // Retried while the server is busy or out of reach; a dead link stops it.
    const { data: session, trouble } = useGuestAnswer(`collab:${token}`, () => getGuestCollabSession(token));

    const tokenFetcher = useCallback(() => guestCollabToken(token), [token]);

    if (!session) {
        return (
            <GuestNotYet trouble={trouble} gone={gone} shape="board" label="Opening the shared board…" />
        );
    }
    if (session.resource_type !== "board" || !session.document_name) return gone;
    const documentName = session.document_name;
    const boardId = session.resource_id;

    return (
        <div className="flex h-dvh w-full flex-col bg-background">
            <header className="flex items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Network className="h-3.5 w-3.5" />
                    </span>
                    <h1 className="truncate">{session.title || "Shared board"}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <MadeWithOneCamp surface="guest-board" className="hidden sm:block" />
                    <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                        <Eye className="h-3 w-3" /> Read only
                    </span>
                </div>
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
