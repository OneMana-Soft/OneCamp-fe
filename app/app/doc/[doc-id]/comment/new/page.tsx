"use client";

import { useParams } from "next/navigation";
import { useMedia } from "@/context/MediaQueryContext";
import { DocMobileNewThread } from "@/components/docComments/DocMobileThread";

/** A new thread on the doc's words, on a phone: Comment brings them here. */
export default function Page() {
    const params = useParams();
    const { isMobile } = useMedia();
    const docId = params?.["doc-id"] as string;
    return <>{isMobile && docId && <DocMobileNewThread docId={docId} />}</>;
}
