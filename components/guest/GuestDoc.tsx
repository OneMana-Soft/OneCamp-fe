"use client";

import { useCallback, useEffect, useId } from "react";
import dynamic from "next/dynamic";
import { getGuestCollabSession, guestCollabToken } from "@/services/guestService";
import { GuestDocViewer } from "@/components/guest/GuestDocViewer";
import { useGuestAnswer } from "@/components/guest/guestUi";
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame";
import { PublicGone, PublicPaperSkeleton } from "@/components/guest/publicStates";
import { retryingText } from "@/services/publicApi";
import { Eye, MessageSquare } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { go } from "@/components/publish/publishCards";
import { StoreProvider } from "@/components/providers/StoreProvider";

// The comments card sits under the doc, so it loads after it, off the page's first load.
const GuestDocComments = dynamic(() => import("@/components/guest/GuestDocComments").then((m) => m.GuestDocComments), { ssr: false });

/**
 * A doc shared with someone outside the workspace (guest/d). Its editor and
 * its comments read the app's store, which a page outside the app doesn't
 * have: the doc brings it (StoreProvider).
 */
export function GuestDoc({ token }: { token: string }) {
    return (
        <StoreProvider>
            <SharedDoc token={token} />
        </StoreProvider>
    );
}

/**
 * Every doc link already sent keeps working: a view link is the server's own
 * script-free page now (the exchange answers its address, never a
 * collaboration token), and the browser goes there; a comment link opens
 * here, in the app, as it always did.
 */
function SharedDoc({ token }: { token: string }) {

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
    const pageURL = session?.page_url;
    useEffect(() => {
        if (pageURL) go.to(pageURL);
    }, [pageURL]);
    if (pageURL) {
        return (
            <PublicFrame surface="guest-doc" mainClassName="sm:px-6 sm:pt-12">
                <PublicPaperSkeleton label="Opening the shared document…" />
            </PublicFrame>
        );
    }

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
            title={title}
            titleFromSm
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
