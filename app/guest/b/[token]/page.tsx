"use client";

import { use, useCallback } from "react";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestBoardViewer } from "@/components/guest/GuestBoardViewer";
import { GuestCentered, GuestLinkGone, GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { Loader2, Network, Eye } from "@/lib/icons";
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

const gone = <GuestLinkGone detail="The share link may have expired or been revoked. Ask the person who shared it for a new link." />;

export default function GuestBoardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // Retried while the server is busy or out of reach; a dead link stops it.
    const { data: session, trouble } = useGuestAnswer(`collab:${token}`, () => getGuestCollabSession(token));

    const tokenFetcher = useCallback(() => guestCollabToken(token), [token]);

    if (!session) {
        return (
            <GuestNotYet
                trouble={trouble}
                gone={gone}
                loading={
                    <GuestCentered>
                        <Loader2 className="h-7 w-7 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Opening the shared board…</p>
                    </GuestCentered>
                }
            />
        );
    }
    if (session.resource_type !== "board" || !session.document_name) return gone;
    const documentName = session.document_name;
    const boardId = session.resource_id;

    return (
        <div className="flex h-screen w-screen flex-col bg-background">
            <header className="flex items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Network className="h-3.5 w-3.5" />
                    </span>
                    Shared board
                </div>
                <div className="flex items-center gap-3">
                    <MadeWithOneCamp surface="guest-board" className="hidden sm:block" />
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
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
