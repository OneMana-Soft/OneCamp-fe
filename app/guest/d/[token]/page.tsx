"use client";

import { use, useEffect, useState } from "react";
import { PublicFrame } from "@/components/guest/PublicFrame";
import { PublicPaperSkeleton } from "@/components/guest/publicStates";
import { UnlockPage } from "@/components/publish/publishCards";
import { GuestDoc } from "@/components/guest/GuestDoc";

/**
 * A doc shared with someone outside the workspace (content.md D20): the
 * public frame (band, mark, half-strength glow), the workspace and the title
 * in the header with the permission tag, and the doc on an 816 px paper card
 * at the doc's own reading scale. The guest comments sit on a second card.
 * On a phone there is no card: the sheet runs full width.
 */
export default function GuestDocPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    // ?unlock=1 is a password page's way in (docs C6): the server's page sends
    // the reader here for its password, and back with its unlock.
    const [mode, setMode] = useState<"unlock" | "doc" | null>(null);
    useEffect(() => setMode(new URLSearchParams(window.location.search).get("unlock") ? "unlock" : "doc"), []);
    if (mode === "unlock") return <UnlockPage pageRef={{ token }} />;
    if (mode === null) {
        return (
            <PublicFrame surface="guest-doc" mainClassName="sm:px-6 sm:pt-12">
                <PublicPaperSkeleton label="Opening the shared document…" />
            </PublicFrame>
        );
    }
    return <GuestDoc token={token} />;
}

