"use client";

import { use, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { CanvasPending } from "@/components/guest/canvasPending";
import { PublicFrame } from "@/components/guest/PublicFrame";
import { LoadFailureState } from "@/components/ui/load-failure-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotShieldLock } from "@/components/auth/authSpots";
import { Button } from "@/components/ui/button";
import { ExternalLink, Eye } from "@/lib/icons";

// A board shared by link, in another site's frame (miro-34): the embed code a
// person copies with a new link (lib/embeds/embedCode.ts) frames this page,
// the one page another site may frame (lib/security/framing.ts). It is the
// link's own page (../page.tsx), compact and strictly read only:
// - it reads nothing of the viewer's: no session, no member state. Its one
//   call is the link's own, POST /guest/collab/<token>, with no cookie, and
//   the canvas's socket is the guest's, read only (the collaboration server
//   re-checks the link on every connect);
// - it offers nothing that writes, shares or tells more than the link does:
//   no React button or hand (quiet), and Open is the link's own page, in a
//   tab of its own;
// - a link turned off or expired says so as the link's own page does (its
//   PublicGone draws this LoadFailureState), with no way on: nothing leaves
//   the frame;
// - a link with a password (miro-33, a password added after the code was
//   copied too) is never typed into another site's frame: the page says the
//   board has a password and opens the link's own page, in a tab of its own.
// On a phone the header is the workspace's mark, the board's name, the tag
// and Open's icon: the workspace's name and Open's word gave the name no room.
const GuestBoardViewer = dynamic(() => import("@/components/guest/GuestBoardViewer").then((m) => m.GuestBoardViewer), {
    ssr: false,
    loading: () => <CanvasPending />,
});

const gone = (
    <main id="main-content" data-embed-gone="" className="flex h-dvh flex-col items-center justify-center bg-background px-4">
        <LoadFailureState kind="gone" noun="shared board" goneDetail="The link may have expired or been turned off." headingLevel={1} className="pt-0" />
    </main>
);

function Locked({ token }: { token: string }) {
    return (
        <main id="main-content" data-embed-locked="" className="flex h-dvh flex-col items-center justify-center bg-background px-4">
            <EmptyState
                illustration={<SpotShieldLock />}
                title="This board has a password"
                description="Open it on its own page to type the password."
                headingLevel={1}
                action={
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <a href={`/guest/b/${encodeURIComponent(token)}`} target="_blank" rel="noopener noreferrer">
                            Open the board
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                    </Button>
                }
            />
        </main>
    );
}

export default function BoardEmbedPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // Retried while the server is busy or out of reach; a dead link stops it.
    // A link that asks for its password is no dead link: its refusal's code says so.
    const [locked, setLocked] = useState(false);
    const { data: session, trouble } = useGuestAnswer(`collab:${token}`, () =>
        getGuestCollabSession(token).then((res) => {
            if (!res.ok) setLocked(res.code === "password_needed");
            return res;
        }),
    );

    const tokenFetcher = useCallback(() => guestCollabToken(token), [token]);

    if (!session) {
        if (locked) return <Locked token={token} />;
        return <GuestNotYet trouble={trouble} gone={gone} shape="board" label="Opening the board…" />;
    }
    if (session.resource_type !== "board" || !session.document_name) return gone;

    return (
        <PublicFrame
            surface="board-embed"
            workspaceName={session.workspace_name}
            className="max-sm:[&_[data-workspace-name]]:hidden max-sm:[&_[data-workspace-name]+span]:hidden"
            fill
            title={session.title || "Shared board"}
            actions={
                <>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                        <Eye className="h-3 w-3" aria-hidden="true" /> Can view
                    </span>
                    <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2">
                        <a href={`/guest/b/${encodeURIComponent(token)}`} target="_blank" rel="noopener noreferrer" aria-label="Open the board in a new tab">
                            <span className="max-sm:hidden">Open</span>
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                    </Button>
                </>
            }
        >
            <div className="relative min-h-0 flex-1">
                <GuestBoardViewer documentName={session.document_name} boardId={session.resource_id} token={token} tokenFetcher={tokenFetcher} quiet />
            </div>
        </PublicFrame>
    );
}
