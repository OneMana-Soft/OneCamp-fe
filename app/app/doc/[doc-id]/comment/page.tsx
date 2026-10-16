"use client";

import { useParams } from "next/navigation";
import { useMedia } from "@/context/MediaQueryContext";
import { DocMobileCommentList } from "@/components/rightPanel/docMobileCommentList";

/** A doc's comments on a phone (wider screens open the panel: layout.tsx). */
export default function Page() {
    const params = useParams();
    const { isMobile } = useMedia();
    const docId = params?.["doc-id"] as string;
    return <>{isMobile && <DocMobileCommentList docId={docId} />}</>;
}
