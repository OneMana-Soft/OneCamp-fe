"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import WorkspaceMemoryPanel from "@/components/ai/WorkspaceMemoryPanel";

function MemoryPageInner() {
    const params = useSearchParams();
    const channelUUID = params.get("channel") || undefined;
    const channelName = params.get("name") || undefined;
    return (
        <div className="h-full w-full">
            <WorkspaceMemoryPanel channelUUID={channelUUID} channelName={channelName} />
        </div>
    );
}

export default function WorkspaceMemoryPage() {
    // useSearchParams requires a Suspense boundary in the app router.
    return (
        <Suspense fallback={<div className="h-full w-full" />}>
            <MemoryPageInner />
        </Suspense>
    );
}
