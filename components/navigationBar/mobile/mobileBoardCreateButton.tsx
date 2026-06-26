"use client"

import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "@/lib/icons";
import { usePost } from "@/hooks/usePost";
import { PostEndpointUrl } from "@/services/endPoints";
import { BoardInfoInterface } from "@/types/board";
import { addUserBoard } from "@/store/slice/userSlice";
import { app_board_path } from "@/types/paths";

// Mobile "+" action that creates a board and opens it. Mirrors the desktop
// InlineBoardCreator flow without the inline title input (kept minimal for the
// compact mobile top bar; the title is editable on the board itself).
export function MobileBoardCreateButton() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { makeRequest, isSubmitting } = usePost();

    const createBoard = () => {
        if (isSubmitting) return;
        makeRequest<{ board_title: string; board_private: boolean }, BoardInfoInterface>({
            payload: { board_title: "Untitled board", board_private: true },
            apiEndpoint: PostEndpointUrl.CreateBoard,
        }).then((res) => {
            if (res?.board_uuid) {
                dispatch(addUserBoard({ board: { board_uuid: res.board_uuid, board_title: res.board_title || "Untitled board" } }));
                router.push(`${app_board_path}/${res.board_uuid}`);
            }
        });
    };

    return (
        <Button variant="ghost" size="icon" onClick={createBoard} disabled={isSubmitting} aria-label="New board">
            {isSubmitting ? <Loader2 className="h-5 animate-spin" /> : <Plus className="h-5" />}
        </Button>
    );
}
