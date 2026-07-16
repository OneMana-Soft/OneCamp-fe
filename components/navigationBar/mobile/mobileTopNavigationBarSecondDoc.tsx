"use client"

import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { DocInfoResponse } from "@/types/doc";

export function MobileTopNavigationBarSecondDoc({ docId }: { docId: string }) {
    const docInfo = useFetch<DocInfoResponse>(
        docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : "",
    );

    return (
        <div className="flex justify-center items-center min-w-0 px-2">
            <span className="text-base font-semibold text-foreground truncate">
                {docInfo.data?.data.doc_title || "Doc"}
            </span>
        </div>
    );
}
