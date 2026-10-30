"use client";

import { use, useCallback } from "react";
import dynamic from "next/dynamic";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { CanvasPending } from "@/components/guest/canvasPending";
import { PublicGone } from "@/components/guest/publicStates";
import { PublicFrame } from "@/components/guest/PublicFrame";
import { Eye } from "@/lib/icons";

// The live canvas (its socket and its drawing library) loads after the
// page's frame, as the member's board does: the guest sees the board's name
// and the frame at once.
const GuestBoardViewer = dynamic(() => import("@/components/guest/GuestBoardViewer").then((m) => m.GuestBoardViewer), {
    ssr: false,
    loading: () => <CanvasPending />,
});

const gone = <PublicGone surface="guest-board" noun="shared board" detail="The link may have expired or been turned off. Ask the person who shared it for a new one." />;

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
        // The one frame every guest page shares (content's PublicFrame, G1):
        // the band, the mark, the header and the credit; the canvas fills it.
        <PublicFrame
            surface="guest-board"
            workspaceName={session.workspace_name}
            fill
            title={session.title || "Shared board"}
            actions={
                <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                    <Eye className="h-3 w-3" /> Read only
                </span>
            }
        >
            <div className="relative min-h-0 flex-1">
                <GuestBoardViewer
                    documentName={documentName}
                    boardId={boardId}
                    token={token}
                    tokenFetcher={tokenFetcher}
                />
            </div>
        </PublicFrame>
    );
}
