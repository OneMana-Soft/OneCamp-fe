"use client";

import { useParams } from "next/navigation";
import { useMedia } from "@/context/MediaQueryContext";
import { DocMobileThread } from "@/components/docComments/DocMobileThread";

/** One thread on a phone, live (N33). Wider screens open it in the doc's panel (../layout.tsx). */
export default function Page() {
    const params = useParams();
    const { isMobile } = useMedia();
    const docId = params?.["doc-id"] as string;
    const threadId = decodeURIComponent((params?.["thread-id"] as string) ?? "");
    return <>{isMobile && docId && threadId && <DocMobileThread docId={docId} threadId={threadId} />}</>;
}
