"use client"

import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { BoardInfoResponse } from "@/types/board";

export function MobileTopNavigationBarSecondBoard({ boardId }: { boardId: string }) {
    const boardInfo = useFetch<BoardInfoResponse>(boardId ? `${GetEndpointUrl.GetBoardInfo}/${boardId}` : '');

    return (
        <div className="text-base font-semibold text-foreground text-center truncate">
            {boardInfo.data?.data?.board_title || "Board"}
        </div>
    );
}
