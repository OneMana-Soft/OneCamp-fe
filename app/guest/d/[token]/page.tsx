"use client";

import { use, useCallback } from "react";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestDocViewer } from "@/components/guest/GuestDocViewer";
import { GuestDocComments } from "@/components/guest/GuestDocComments";
import { GuestBand, GuestLinkGone, GuestNotYet, GuestTypeTile, useGuestAnswer } from "@/components/guest/guestUi";
import { FileText, Eye, MessageSquare } from "@/lib/icons";
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

const gone = <GuestLinkGone detail="The share link may have expired or been revoked. Ask the person who shared it for a new link." />;

export default function GuestDocPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // 1. Validate the link and resolve the document name before mounting the
    //    collaborative viewer, trying again while the server is busy or out of
    //    reach. A dead link, or one to something else, is "no longer available".
    const { data: session, trouble } = useGuestAnswer(`collab:${token}`, () => getGuestCollabSession(token));

    // 2. The collab provider refetches a fresh short-lived guest token on every
    //    (re)connect; the backend re-validates the grant each time, so a revoked
    //    or expired link stops working immediately.
    const tokenFetcher = useCallback(() => guestCollabToken(token), [token]);

    if (!session) {
        return (
            <GuestNotYet trouble={trouble} gone={gone} shape="page" label="Opening the shared document…" />
        );
    }
    if (session.resource_type !== "doc" || !session.document_name) return gone;
    const documentName = session.document_name;
    const canComment = session.capability === "comment";

    return (
        <div className="min-h-dvh w-full bg-background">
            <GuestBand />
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <GuestTypeTile>
                        <FileText />
                    </GuestTypeTile>
                    <h1 className="truncate">{session.title || "Shared document"}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <MadeWithOneCamp surface="guest-doc" className="hidden sm:block" />
                    <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                        {canComment ? (
                            <>
                                <MessageSquare className="h-3 w-3" /> Can comment
                            </>
                        ) : (
                            <>
                                <Eye className="h-3 w-3" /> Read only
                            </>
                        )}
                    </span>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <GuestDocViewer documentName={documentName} tokenFetcher={tokenFetcher} />
                <GuestDocComments token={token} />
            </main>
        </div>
    );
}
