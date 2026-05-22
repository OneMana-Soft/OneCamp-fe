import React from "react";
import { FileText } from "@/lib/icons";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";

interface DocItemProps {
    docName: string;
    docCreatedBy: string;
    docCreatedAt: string;
    userSelected: boolean
}

export const DocListItem: React.FC<DocItemProps> = ({
   docName,
   docCreatedBy,
   docCreatedAt,
   userSelected,
}) => {

    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);

    return (
        <div className={`flex items-start gap-3 px-3 py-2.5 hover:cursor-pointer hover:bg-accent/40 transition-colors duration-150 w-full ${userSelected ? "bg-accent" : ""}`}>
            <div className="shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                    <span className="font-medium text-sm truncate">
                        {docName}
                    </span>
                    {docCreatedAt && (
                        <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                            {formatTimeForPostOrComment(docCreatedAt)}
                        </span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                    By {docCreatedBy}
                </div>
            </div>
        </div>
    );
};
