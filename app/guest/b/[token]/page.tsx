"use client";

import { use } from "react";
import { GuestBoardLink } from "@/components/guest/GuestBoardLink";

// A board shared by link (whiteboard W-1; miro-33): its password, the guest's
// name and the live board, in components/guest/GuestBoardLink; the live canvas
// is a chunk of its own there.
export default function GuestBoardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    return <GuestBoardLink token={token} />;
}
