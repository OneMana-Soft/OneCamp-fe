"use client";

import { use, useCallback, useId } from "react";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestDocViewer } from "@/components/guest/GuestDocViewer";
import { GuestDocComments } from "@/components/guest/GuestDocComments";
import { useGuestAnswer } from "@/components/guest/guestUi";
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame";
import { PublicGone, PublicPaperSkeleton } from "@/components/guest/publicStates";
import { retryingText } from "@/services/publicApi";
import { Eye, MessageSquare } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";

/**
 * A doc shared with someone outside the workspace (content.md D20): the
 * public frame (band, mark, half-strength glow), the workspace and the title
 * in the header with the permission tag, and the doc on an 816 px paper card
 * at the doc's own reading scale. The guest comments sit on a second card.
 * On a phone there is no card: the sheet runs full width.
 */
export default function GuestDocPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // Validate the link and resolve the document name before mounting the
    // collaborative viewer, trying again while the server is busy or out of
    // reach. A dead link, or one to something else, has stopped working.
    const { data: session, trouble } = useGuestAnswer(`collab:${token}`, () => getGuestCollabSession(token));

    // The collab provider refetches a fresh short-lived guest token on every
    // (re)connect; the backend re-validates the grant each time, so a revoked
    // or expired link stops working at once.
    const tokenFetcher = useCallback(() => guestCollabToken(token), [token]);
    // The title names the doc's text for a screen reader.
    const titleId = useId();

    if (trouble === "gone" || (session && (session.resource_type !== "doc" || !session.document_name))) {
        return <PublicGone surface="guest-doc" noun="shared doc" detail="The link may have expired or been turned off. Ask the person who shared it for a new one." />
    }
    if (!session) {
        return (
            <PublicFrame surface="guest-doc" mainClassName="sm:px-6 sm:pt-12">
                <PublicPaperSkeleton label={trouble ? retryingText[trouble] : "Opening the shared document…"} />
            </PublicFrame>
        )
    }
    const canComment = session.capability === "comment";
    const title = session.title || "Shared document"

    return (
        <PublicFrame
            surface="guest-doc"
            workspaceName={session.workspace_name}
            title={<span className="max-sm:hidden">{title}</span>}
            actions={<PermissionTag canComment={canComment} />}
            mainClassName="gap-4 sm:gap-6 sm:px-6 sm:pt-12"
        >
            <PaperCard elevation="sheet" className="max-w-[816px] px-5 pb-10 pt-6 sm:px-12 sm:pb-14 sm:pt-14" data-guest-doc-paper="">
                <div className="mx-auto w-full max-w-[var(--doc-measure)]" data-doc-measure="">
                    <h1 id={titleId} className="text-doc-title text-ink [text-wrap:balance] max-sm:text-title-1">{title}</h1>
                    <GuestDocViewer documentName={session.document_name} tokenFetcher={tokenFetcher} labelledBy={titleId} />
                </div>
            </PaperCard>
            <GuestDocComments token={token} />
        </PublicFrame>
    );
}

/** 18 px, r5, 11/510: "Can comment" on the sky tint, "Read only" neutral. */
function PermissionTag({ canComment }: { canComment: boolean }) {
    return (
        <span
            data-permission-tag=""
            className={cn(
                "inline-flex h-[18px] items-center gap-1 rounded-[5px] px-1.5 text-micro font-medium",
                canComment ? "hue-sky bg-hue-tint text-hue-ink" : "bg-sunken text-ink-2",
            )}
        >
            {canComment ? <MessageSquare className="size-3" aria-hidden="true" /> : <Eye className="size-3" aria-hidden="true" />}
            {canComment ? "Can comment" : "Read only"}
        </span>
    )
}
