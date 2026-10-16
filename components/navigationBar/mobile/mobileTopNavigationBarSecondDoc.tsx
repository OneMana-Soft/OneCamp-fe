"use client"

import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { DocInfoResponse } from "@/types/doc";

/**
 * The doc's name in the phone's top bar; `page` names a page of the doc's
 * own before it: "Comments · Q4 launch plan" (QA DSA-23: the comments page
 * said "Comments" alone).
 */
export function MobileTopNavigationBarSecondDoc({ docId, page }: { docId: string; page?: string }) {
    const docInfo = useFetch<DocInfoResponse>(
        docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : "",
    );
    const title = docInfo.data?.data.doc_title?.trim();

    return (
        <div className="flex justify-center items-center min-w-0 px-2">
            <span data-doc-phone-title="" className="text-base font-semibold text-foreground truncate">
                {page ? (title ? `${page} · ${title}` : page) : title || "Doc"}
            </span>
        </div>
    );
}
