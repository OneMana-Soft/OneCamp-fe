import { displayNameOf } from "@/lib/personName"
import React from 'react';
import { DocInfoInterface } from "@/types/doc";
import { DocPreview } from "@/components/doc/docPreview";
import { shortDate } from "@/lib/utils/date/shortDate";
import { cn } from "@/lib/utils/helpers/cn";
import TouchableDiv from "@/components/animation/touchRippleAnimation";

interface DocCardProps {
    doc: DocInfoInterface;
    onClick: (docId: string) => void;
    className?: string;
}

export const DocCard: React.FC<DocCardProps> = ({ doc, onClick, className }) => {
    
    // Format date similar to Google Docs (e.g., "Opened Jan 12, 2024")
    // Assuming doc_updated_at is the relevant timestamp, or created_at if updated is missing.
    const displayDate = doc.doc_updated_at || doc.doc_created_at;
    let dateStr = "";
    if (displayDate) {
        try {
            const d = new Date(displayDate);
            if (!isNaN(d.getTime())) {
                dateStr = shortDate(d);
            }
        } catch(e) {
            // Ignore invalid date
        }
    }

    return (
        <TouchableDiv 
            className={cn(
                "group relative flex flex-col border rounded-lg overflow-hidden bg-background border-border hover:border-input transition-colors duration-150 cursor-pointer h-64 md:h-72", 
                className
            )}
            onClick={() => onClick(doc.doc_uuid)}
        >
            {/* Preview Area (Top ~2/3) */}
            <div className="flex-1 bg-muted/30 border-b border-border relative overflow-hidden">
                <DocPreview content={doc.doc_snippet || doc.doc_body} className="w-full h-full" />
            </div>

            {/* Metadata Area (Bottom ~1/3) */}
            <div className="px-3 bg-card flex flex-col justify-center h-16">
                <div className="flex items-start justify-between">
                    <h3 className="text-sm font-medium text-card-foreground truncate pr-2 w-full" title={doc.doc_title}>
                        {doc.doc_title || "Untitled"}
                    </h3>
                    {/* Optional: Menu Trigger could go here */}
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground tabular-nums truncate">
                        {dateStr}
                    </span>
                     {/* Owner info could act as a secondary subtitle */}
                     {/* <span className="text-xs text-muted-foreground mx-1">•</span>
                     <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                        {displayNameOf(doc.doc_created_by)}
                     </span> */}
                </div>
            </div>
        </TouchableDiv>
    );
};
