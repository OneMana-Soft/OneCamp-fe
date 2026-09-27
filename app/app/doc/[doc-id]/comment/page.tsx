"use client";


import {useMedia} from "@/context/MediaQueryContext";
import {useParams} from "next/navigation";
import {DocMobileCommentList} from "@/components/rightPanel/docMobileCommentList";

export default function Page() {
    const params = useParams();

    const {isMobile} = useMedia()
    const docId = params?.['doc-id'] as string;


    return <>{isMobile && <DocMobileCommentList docId={docId} />}</>

}
